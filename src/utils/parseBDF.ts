export interface ParsedEEG {
  /** Downsampled (≤3000 pts) z-scored channels for display */
  channels: { name: string; data: number[] }[];
  /** Full original-rate raw integer samples — needed for frequency filtering */
  rawChannels: { name: string; data: number[] }[];
  /** Effective sfreq of the downsampled display channels */
  sfreq: number;
  /** Original file sampling frequency */
  originalSfreq: number;
  duration: number;
}

/**
 * Parse a BDF (BioSemi) or EDF file directly in the browser.
 * BDF uses 24-bit (3-byte) signed samples; EDF uses 16-bit (2-byte).
 * Returns up to maxSeconds of data for up to 20 EEG channels.
 */
export async function parseBDF(file: File, maxSeconds = 60): Promise<ParsedEEG> {
  const _textDecoder = new TextDecoder("utf-8", { fatal: false });
  function readStr(buf: Uint8Array, offset: number, length: number): string {
    try {
      return _textDecoder.decode(buf.slice(offset, offset + length)).trim();
    } catch {
      // Fallback for unusual encodings (Latin-1, etc.)
      return String.fromCharCode(...buf.slice(offset, offset + length)).trim();
    }
  }

  // ── Main header (256 bytes) ──────────────────────────────────────────────
  const mainHdr = new Uint8Array(await file.slice(0, 256).arrayBuffer());

  const isBDF = mainHdr[0] === 0xff;
  const bytesPerSample = isBDF ? 3 : 2;

  const ns = parseInt(readStr(mainHdr, 252, 4));
  let nRecords = parseInt(readStr(mainHdr, 236, 8));
  const recordDuration = parseFloat(readStr(mainHdr, 244, 8)) || 1;
  const headerSize = 256 * (ns + 1);

  // ── Signal headers ────────────────────────────────────────────────────────
  const sigHdr = new Uint8Array(await file.slice(256, headerSize).arrayBuffer());

  const labels: string[] = [];
  for (let i = 0; i < ns; i++) labels.push(readStr(sigHdr, i * 16, 16));

  const nSampOffset = ns * (16 + 80 + 8 + 8 + 8 + 8 + 8 + 80);
  const nSampPerRec: number[] = [];
  for (let i = 0; i < ns; i++)
    nSampPerRec.push(parseInt(readStr(sigHdr, nSampOffset + i * 8, 8)));

  const sigByteOffset: number[] = [];
  let off = 0;
  for (let i = 0; i < ns; i++) {
    sigByteOffset.push(off);
    off += nSampPerRec[i] * bytesPerSample;
  }
  const recordSize = off;

  if (nRecords <= 0)
    nRecords = Math.floor((file.size - headerSize) / recordSize);

  const originalSfreq = nSampPerRec[0] / recordDuration;

  // ── Select EEG channels (skip Status/trigger channels, cap at 20) ─────────
  const eegIndices = labels
    .map((l, i) => ({ label: l.toLowerCase(), i }))
    .filter(({ label }) => !label.includes("status") && label !== "")
    .slice(0, 128)
    .map(({ i }) => i);

  if (eegIndices.length === 0) throw new Error("No EEG channels found in file.");

  // ── Read data records ─────────────────────────────────────────────────────
  const maxRecs = Math.min(nRecords, Math.ceil(maxSeconds / recordDuration));
  const dataBytes = new Uint8Array(
    await file.slice(headerSize, headerSize + maxRecs * recordSize).arrayBuffer()
  );

  const chanBufs: number[][] = eegIndices.map(() => []);

  for (let rec = 0; rec < maxRecs; rec++) {
    const recStart = rec * recordSize;
    for (let ci = 0; ci < eegIndices.length; ci++) {
      const si = eegIndices[ci];
      const sigStart = recStart + sigByteOffset[si];
      const n = nSampPerRec[si];
      for (let s = 0; s < n; s++) {
        const p = sigStart + s * bytesPerSample;
        let val: number;
        if (bytesPerSample === 3) {
          val = dataBytes[p] | (dataBytes[p + 1] << 8) | (dataBytes[p + 2] << 16);
          if (val >= 0x800000) val -= 0x1000000;
        } else {
          val = dataBytes[p] | (dataBytes[p + 1] << 8);
          if (val >= 0x8000) val -= 0x10000;
        }
        chanBufs[ci].push(val);
      }
    }
  }

  // ── Save raw channels BEFORE downsampling (needed for frequency filtering) ─
  const rawChannels = chanBufs.map((raw, ci) => ({
    name: labels[eegIndices[ci]],
    data: [...raw],
  }));

  // ── Downsample to ≤3000 pts and z-score normalise for initial display ─────
  const TARGET_PTS = 3000;
  const channels = chanBufs.map((raw, ci) => {
    let data = raw;
    if (raw.length > TARGET_PTS) {
      const step = Math.floor(raw.length / TARGET_PTS);
      data = raw.filter((_, idx) => idx % step === 0);
    }
    const n = data.length || 1;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
    return {
      name: labels[eegIndices[ci]],
      data: data.map((v) => Math.round(((v - mean) / std) * 1e4) / 1e4),
    };
  });

  const duration = maxRecs * recordDuration;
  const effectiveSfreq = channels[0].data.length / duration;

  return { channels, rawChannels, sfreq: effectiveSfreq, originalSfreq, duration };
}
