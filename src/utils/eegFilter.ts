// ── FFT (Cooley-Tukey radix-2, in-place) ────────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = -Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let uRe = 1, uIm = 0;
      for (let j = 0; j < len >> 1; j++) {
        const aRe = re[i + j], aIm = im[i + j];
        const bRe = re[i + j + (len >> 1)] * uRe - im[i + j + (len >> 1)] * uIm;
        const bIm = re[i + j + (len >> 1)] * uIm + im[i + j + (len >> 1)] * uRe;
        re[i + j] = aRe + bRe;
        im[i + j] = aIm + bIm;
        re[i + j + (len >> 1)] = aRe - bRe;
        im[i + j + (len >> 1)] = aIm - bIm;
        const nu = uRe * wRe - uIm * wIm;
        uIm = uRe * wIm + uIm * wRe;
        uRe = nu;
      }
    }
  }
}

/**
 * Zero-phase FFT bandpass filter.
 * Pads to next power-of-2, zeroes out-of-band bins, IFFTs.
 */
export function bandpassFilter(
  signal: number[],
  sfreq: number,
  lowHz: number,
  highHz: number
): number[] {
  const origLen = signal.length;
  let n = 1;
  while (n < origLen) n <<= 1;

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < origLen; i++) re[i] = signal[i];

  fft(re, im);

  // Frequency resolution
  const df = sfreq / n;
  for (let k = 0; k < n; k++) {
    const freq = k <= n / 2 ? k * df : (n - k) * df;
    if (freq < lowHz || freq > highHz) {
      re[k] = 0;
      im[k] = 0;
    }
  }

  // IFFT: conjugate → FFT → conjugate → /n
  for (let k = 0; k < n; k++) im[k] = -im[k];
  fft(re, im);
  const out = new Array<number>(origLen);
  for (let i = 0; i < origLen; i++) out[i] = re[i] / n;
  return out;
}

/** Downsample array to at most targetPts points */
export function downsample(data: number[], targetPts: number): number[] {
  if (data.length <= targetPts) return data;
  const step = Math.floor(data.length / targetPts);
  return data.filter((_, i) => i % step === 0);
}

/** Z-score normalise an array */
export function zscore(data: number[]): number[] {
  const n = data.length || 1;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return data.map((v) => Math.round(((v - mean) / std) * 1e4) / 1e4);
}

// ── Channel groups ────────────────────────────────────────────────────────────
const GROUP_CHANNELS: Record<string, Set<string>> = {
  frontal: new Set([
    "Fp1","Fp2","Fpz","F7","F5","F3","F1","Fz","F2","F4","F6","F8",
    "AF3","AF4","AF7","AF8","AFz","FC1","FC2","FC3","FC4","FC5","FC6","FCz","FT7","FT8",
  ]),
  central: new Set([
    "C1","C2","C3","Cz","C4","C5","C6",
    "CP1","CP2","CP3","CPz","CP4","CP5","CP6",
  ]),
  parietal: new Set([
    "P1","P2","P3","Pz","P4","P5","P6","P7","P8",
    "PO3","PO4","POz","PO7","PO8",
  ]),
  occipital: new Set(["O1","Oz","O2","Iz"]),
  temporal: new Set(["T7","T8","TP7","TP8","TP9","TP10"]),
};

/**
 * Returns the subset of channelNames that belong to the given group.
 * Falls back to all names if none match (e.g. BioSemi A1/A2 style).
 */
export function getGroupChannels(channelNames: string[], group: string): string[] {
  if (group === "all") return channelNames;
  const set = GROUP_CHANNELS[group];
  if (!set) return channelNames;
  const matched = channelNames.filter((n) => set.has(n));
  return matched.length > 0 ? matched : channelNames;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────
export interface Anomaly {
  channelName: string;
  timeStart: number;
  timeEnd: number;
  /** "spike" | "burst" | "suppression" */
  type: string;
  severity: number; // 0–1
}

/**
 * Detect anomalies in downsampled z-scored channel data.
 *
 * Spike detection: point-wise — flags individual samples where |z| ≥ 5,
 * then merges events within 0.3 s of each other into a single anomaly.
 * This avoids the false-positive storm that 1-second RMS windowing caused
 * (z > 2.5 on a window basis flags ~4-5 % of all windows statistically).
 *
 * Suppression detection: 1-second RMS windowing, threshold < 15 % of mean.
 */
export function detectAnomalies(
  channels: { name: string; data: number[] }[],
  sfreq: number
): Anomaly[] {
  const result: Anomaly[] = [];
  const windowSamples  = Math.max(1, Math.round(sfreq));
  const SPIKE_Z        = 6.0;   // samples must exceed 6 σ — only major outliers
  const MERGE_GAP_S    = 0.3;   // merge spike events within 0.3 s of each other

  for (const ch of channels) {
    const { data } = ch;
    if (data.length < windowSamples * 2) continue;

    // ── Point-wise spike detection ──────────────────────────────────────────
    // Phase 1: mark every sample that exceeds the spike threshold
    const isSpike = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) >= SPIKE_Z) isSpike[i] = 1;
    }

    // Phase 2: fill gaps shorter than MERGE_GAP_S so nearby spikes merge
    const mergeGap = Math.round(MERGE_GAP_S * sfreq);
    for (let i = 0; i < data.length; i++) {
      if (!isSpike[i]) continue;
      // Find the next spike sample
      let j = i + 1;
      while (j < data.length && !isSpike[j]) j++;
      if (j < data.length && j - i <= mergeGap) {
        for (let k = i; k < j; k++) isSpike[k] = 1;
      }
      i = j - 1;
    }

    // Phase 3: group consecutive marked samples into Anomaly events
    let i = 0;
    while (i < data.length) {
      if (!isSpike[i]) { i++; continue; }
      let j = i + 1;
      while (j < data.length && isSpike[j]) j++;
      // Peak absolute z-score in this cluster
      let peakZ = 0;
      for (let k = i; k < j; k++) peakZ = Math.max(peakZ, Math.abs(data[k]));
      result.push({
        channelName: ch.name,
        timeStart:   i / sfreq,
        timeEnd:     j / sfreq,
        type:        "spike",
        severity:    Math.min((peakZ - SPIKE_Z) / 5, 1),
      });
      i = j;
    }

    // ── Suppression detection (1-second RMS windowing) ─────────────────────
    const nWin = Math.floor(data.length / windowSamples);
    if (nWin < 4) continue;

    const rmsPerWin: number[] = [];
    for (let w = 0; w < nWin; w++) {
      const slice = data.slice(w * windowSamples, (w + 1) * windowSamples);
      rmsPerWin.push(Math.sqrt(slice.reduce((a, v) => a + v * v, 0) / slice.length));
    }
    const meanRms = rmsPerWin.reduce((a, b) => a + b, 0) / nWin;
    if (meanRms <= 0.1) continue; // flat / near-zero channel — skip

    for (let w = 0; w < nWin; w++) {
      if (rmsPerWin[w] < meanRms * 0.15) {
        result.push({
          channelName: ch.name,
          timeStart:   w,
          timeEnd:     w + 1,
          type:        "suppression",
          severity:    0.5,
        });
      }
    }
  }

  return result.sort((a, b) => a.timeStart - b.timeStart);
}

export const BANDPASS_RANGES: Record<string, [number, number]> = {
  Raw:   [0, Infinity],
  Theta: [4,  8],
  Alpha: [8, 12],
  Beta:  [13, 30],
  Gamma: [30, 45],
};
