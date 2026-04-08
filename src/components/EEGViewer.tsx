import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity, ZoomIn, ZoomOut, RotateCcw, Play, Pause,
  Eye, EyeOff, Download, Zap, Brain,
  ChevronDown, Filter, AlertTriangle, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { parseBDF } from "@/utils/parseBDF";
import {
  bandpassFilter, downsample, zscore,
  detectAnomalies, BANDPASS_RANGES, type Anomaly,
} from "@/utils/eegFilter";
import type { SavedEEGChannels } from "@/services/sessionHistory";

interface EEGChannel { name: string; data: number[] }

interface EEGViewerProps {
  file?: File | null;
  savedData?: SavedEEGChannels | null;
  onClose?: () => void;
}

const BANDPASS_MODES = [
  { id: "Raw",   label: "Raw (pre-filtered)" },
  { id: "Theta", label: "Theta (4–8 Hz)"    },
  { id: "Alpha", label: "Alpha (8–12 Hz)"   },
  { id: "Beta",  label: "Beta (13–30 Hz)"   },
  { id: "Gamma", label: "Gamma (30–45 Hz)"  },
];

const CHANNEL_COLORS = [
  "#15803d","#1d4ed8","#b45309","#ef4444","#7e22ce",
  "#be185d","#0f766e","#c2410c","#6d28d9","#0e7490",
  "#4d7c0f","#be123c","#4338ca","#047857","#92400e",
  "#6d28d9","#0e7490","#c2410c","#15803d","#1d4ed8",
];

const ANOMALY_COLORS: Record<string, string> = {
  spike:       "#ef4444",  // red
  suppression: "#1d4ed8",  // blue-700 — better contrast on light
};

const TARGET_PTS = 3000;

const EEGViewer = ({ file, savedData, onClose }: EEGViewerProps) => {
  const isSavedSession = !file && !!savedData;

  // ── Data state ───────────────────────────────────────────────────────────
  const [channels, setChannels]     = useState<EEGChannel[]>([]);
  const [sfreq, setSfreq]           = useState(50);
  const [duration, setDuration]     = useState(0);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [anomalies, setAnomalies]   = useState<Anomaly[]>([]);

  // ── View state ────────────────────────────────────────────────────────────
  const [bandpassMode, setBandpassMode]     = useState("Raw");
  const [viewStart, setViewStart]           = useState(0);
  const [zoomLevel, setZoomLevel]           = useState(1);
  const [amplitudeScale, setAmplitudeScale] = useState(1);
  const [visibleChannels, setVisibleChannels] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying]           = useState(false);
  const [showFindings, setShowFindings]     = useState(true);
  const [showAnomalies, setShowAnomalies]   = useState(false);

  // ── Raw-data refs ─────────────────────────────────────────────────────────
  const rawChannelsRef    = useRef<{ name: string; data: number[] }[]>([]);
  const originalSfreqRef  = useRef(512);
  const bandpassModeRef   = useRef(bandpassMode);
  const playIntervalRef   = useRef<NodeJS.Timeout | null>(null);
  const svgRef            = useRef<SVGSVGElement>(null);
  const waveformRef       = useRef<HTMLDivElement>(null);

  useEffect(() => { bandpassModeRef.current = bandpassMode; }, [bandpassMode]);

  // ── Apply filter + downsample from raw data ───────────────────────────────
  const applyFilterAndUpdate = useCallback((mode: string) => {
    const raw = rawChannelsRef.current;
    const sf  = originalSfreqRef.current;
    if (raw.length === 0) return;

    const processed = raw.map((ch) => {
      let data = ch.data;
      if (mode !== "Raw") {
        const [lo, hi] = BANDPASS_RANGES[mode];
        data = bandpassFilter(data, sf, lo, hi);
      }
      return { name: ch.name, data: zscore(downsample(data, TARGET_PTS)) };
    });

    setChannels(processed);
  }, []);

  // ── Load data — either from File (live) or savedData (history) ───────────
  const loadEEGData = useCallback(async () => {
    // Historical session: use pre-saved channel data directly
    if (isSavedSession && savedData) {
      const chNames = savedData.channels.map((c) => c.name);
      setSfreq(savedData.sfreq);
      setDuration(savedData.duration);
      originalSfreqRef.current = savedData.originalSfreq;
      setChannels(savedData.channels);
      setVisibleChannels(new Set(chNames));
      // Show ~10 s initially so time controls are usable from the start
      setZoomLevel(Math.max(1, Math.ceil(savedData.duration / 10)));
      setViewStart(0);
      return;
    }
    // Live session: parse the BDF file
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const parsed = await parseBDF(file, 60);
      rawChannelsRef.current   = parsed.rawChannels;
      originalSfreqRef.current = parsed.originalSfreq;

      const chNames = parsed.channels.map((c) => c.name);
      setSfreq(parsed.sfreq);
      setDuration(parsed.duration);

      if (bandpassModeRef.current === "Raw") {
        setChannels(parsed.channels);
      } else {
        applyFilterAndUpdate(bandpassModeRef.current);
      }

      setVisibleChannels(new Set(chNames));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse EEG file");
    } finally {
      setIsLoading(false);
    }
  }, [file, savedData, isSavedSession, applyFilterAndUpdate]);

  useEffect(() => { loadEEGData(); }, [loadEEGData]);

  // ── Re-filter when bandpass mode changes (live only — saved has no rawChannels) ──
  useEffect(() => {
    if (isSavedSession) return;
    applyFilterAndUpdate(bandpassMode);
  }, [bandpassMode, applyFilterAndUpdate, isSavedSession]);

  // ── Detect anomalies whenever displayed channels update ───────────────────
  useEffect(() => {
    if (channels.length === 0) return;
    setAnomalies(detectAnomalies(channels, sfreq));
  }, [channels, sfreq]);

  // ── Playback ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setViewStart((prev) => {
          const max = Math.max(0, duration - visibleDuration);
          if (prev >= max) { setIsPlaying(false); return 0; }
          return prev + 0.1 * zoomLevel;
        });
      }, 100);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, duration, zoomLevel]); // eslint-disable-line

  const visibleDuration = Math.max(1, duration / zoomLevel);
  const viewEnd = Math.min(viewStart + visibleDuration, duration);

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleZoomIn  = () => setZoomLevel((z) => Math.min(z * 2, 32));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z / 2, 1));
  const handlePanLeft = () => setViewStart((s) => Math.max(0, s - visibleDuration * 0.4));
  const handlePanRight= () => setViewStart((s) => Math.min(duration - visibleDuration, s + visibleDuration * 0.4));
  const handleReset   = () => { setZoomLevel(1); setViewStart(0); setAmplitudeScale(1); };

  const toggleChannel = (name: string) => {
    setVisibleChannels((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ channels, sfreq, duration }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `eeg-${file?.name ?? "session"}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Trackpad / mouse-wheel horizontal scroll ──────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    e.preventDefault();
    const secondsPerPixel = visibleDuration / (waveformRef.current?.clientWidth ?? 1000);
    setViewStart((prev) => {
      const next = prev + e.deltaX * secondsPerPixel;
      return Math.max(0, Math.min(next, duration - visibleDuration));
    });
  }, [visibleDuration, duration]);

  // ── Waveform SVG ───────────────────────────────────────────────────────────
  const WaveformDisplay = () => {
    const visible = channels.filter((c) => visibleChannels.has(c.name));
    if (visible.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <EyeOff className="w-6 h-6 mr-2" /> No channels visible.
        </div>
      );
    }

    const channelHeight = 54;
    const pad = { top: 24, bottom: 40, left: 56, right: 20 };
    const W   = 1000;
    const H   = visible.length * channelHeight + pad.top + pad.bottom;

    const startSample = Math.floor(viewStart * sfreq);
    const endSample   = Math.min(Math.ceil(viewEnd * sfreq), channels[0]?.data.length ?? 0);
    const totalSamples = endSample - startSample;
    if (totalSamples <= 0) return null;

    const innerW = W - pad.left - pad.right;

    const path = (ch: EEGChannel, idx: number) => {
      const yC = pad.top + idx * channelHeight + channelHeight / 2;
      const pts = ch.data.slice(startSample, endSample);
      if (pts.length < 2) return "";
      const mn = Math.min(...pts), mx = Math.max(...pts);
      const range = mx - mn || 1;
      const amp = (channelHeight * 0.42) * amplitudeScale;
      return pts.map((v, i) => {
        const x = pad.left + (i / (pts.length - 1)) * innerW;
        const y = yC - (((v - mn) / range) - 0.5) * 2 * amp;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
    };

    const numLabels = Math.min(10, Math.floor(visibleDuration) + 1);
    const timeLabels = Array.from({ length: numLabels }, (_, i) => ({
      x: pad.left + (i / (numLabels - 1)) * innerW,
      t: (viewStart + (i / (numLabels - 1)) * visibleDuration).toFixed(1) + "s",
    }));

    const visAnomalies = showAnomalies
      ? anomalies.filter((a) => a.timeEnd >= viewStart && a.timeStart <= viewEnd)
      : [];

    return (
      <div className="overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]">
          <rect x={0} y={0} width={W} height={H} fill="hsl(var(--card))" />

          {visAnomalies.map((a, i) => {
            const x1 = pad.left + Math.max(0, (a.timeStart - viewStart) / visibleDuration) * innerW;
            const x2 = pad.left + Math.min(1, (a.timeEnd   - viewStart) / visibleDuration) * innerW;
            const rawW = x2 - x1;
            // Spikes are brief — enforce a minimum of 8 SVG units so they're
            // always visible, centered on the event position.
            const isSpike = a.type === "spike";
            const displayW = isSpike ? Math.max(rawW, 8) : Math.max(rawW, 1);
            const displayX = isSpike ? (x1 + x2) / 2 - displayW / 2 : x1;
            return (
              <rect key={i}
                x={displayX} y={pad.top}
                width={displayW}
                height={H - pad.top - pad.bottom}
                fill={ANOMALY_COLORS[a.type] ?? "#ef4444"}
                opacity={isSpike ? 0.35 + a.severity * 0.4 : 0.18 + a.severity * 0.15}
              />
            );
          })}

          {timeLabels.map((tl, i) => (
            <line key={i} x1={tl.x} y1={pad.top} x2={tl.x} y2={H - pad.bottom}
              stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="4,4" />
          ))}

          {visible.map((ch, idx) => {
            const yC = pad.top + idx * channelHeight + channelHeight / 2;
            const ci = channels.findIndex((c) => c.name === ch.name);
            return (
              <g key={ch.name}>
                <line x1={pad.left} y1={yC} x2={W - pad.right} y2={yC}
                  stroke="hsl(var(--border))" strokeWidth={0.4} strokeDasharray="2,6" opacity={0.4} />
                <text x={pad.left - 6} y={yC + 4} textAnchor="end"
                  fill="hsl(var(--foreground))" fontSize={11} fontFamily="monospace">
                  {ch.name}
                </text>
                <path d={path(ch, idx)} fill="none"
                  stroke={CHANNEL_COLORS[ci % CHANNEL_COLORS.length]}
                  strokeWidth={1.4} strokeLinejoin="round" opacity={0.9} />
              </g>
            );
          })}

          {timeLabels.map((tl, i) => (
            <g key={`t${i}`}>
              <line x1={tl.x} y1={H - pad.bottom} x2={tl.x} y2={H - pad.bottom + 5}
                stroke="hsl(var(--foreground))" strokeWidth={1} />
              <text x={tl.x} y={H - pad.bottom + 17} textAnchor="middle"
                fill="hsl(var(--muted-foreground))" fontSize={10}>{tl.t}</text>
            </g>
          ))}
          <text x={W / 2} y={H - 4} textAnchor="middle"
            fill="hsl(var(--foreground))" fontSize={12}>Time (seconds)</text>
        </svg>
      </div>
    );
  };

  // ── Loading / error guards ─────────────────────────────────────────────────
  if (isLoading) return null;
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Zap className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="font-medium text-destructive">Failed to Parse EEG File</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadEEGData}>Try Again</Button>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                EEG Viewer
                {isSavedSession && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    <History className="w-3 h-3" /> Saved Session
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {duration.toFixed(0)}s · {originalSfreqRef.current} Hz · {channels.length} channels
                {isSavedSession && " · frequency filtering unavailable"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4" />
            </Button>
            {onClose && <Button variant="outline" size="sm" onClick={onClose}>Close</Button>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── Controls ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
          {/* Frequency band — disabled for saved sessions */}
          <div className={isSavedSession ? "opacity-40 pointer-events-none" : ""} title={isSavedSession ? "Frequency filtering unavailable for saved sessions" : undefined}>
            <Select value={bandpassMode} onValueChange={setBandpassMode} disabled={isSavedSession}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANDPASS_MODES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View Anomalies toggle */}
          <Button
            variant={showAnomalies ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAnomalies((v) => !v)}
            className="flex items-center gap-1.5"
          >
            {showAnomalies ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            View Anomalies
            {anomalies.length > 0 && (
              <Badge variant={showAnomalies ? "secondary" : "outline"} className="text-xs ml-1">
                {anomalies.length}
              </Badge>
            )}
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <Button variant="outline" size="sm" onClick={handleZoomIn}><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={handleZoomOut}><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={handlePanLeft}>
            <ChevronDown className="w-4 h-4 rotate-90" />
          </Button>
          <Button variant="outline" size="sm" onClick={handlePanRight}>
            <ChevronDown className="w-4 h-4 -rotate-90" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="w-4 h-4" /></Button>

          <div className="h-6 w-px bg-border mx-1" />

          <Button variant={isPlaying ? "default" : "outline"} size="sm" onClick={() => setIsPlaying((p) => !p)}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>

          {zoomLevel > 1 && (
            <Badge variant="secondary" className="ml-auto">{zoomLevel.toFixed(1)}x zoom</Badge>
          )}
        </div>

        {/* Amplitude */}
        <div className="flex items-center gap-4 px-1">
          <span className="text-sm text-muted-foreground w-28">Amplitude scale:</span>
          <Slider value={[amplitudeScale]} onValueChange={([v]) => setAmplitudeScale(v)}
            min={0.2} max={4} step={0.1} className="flex-1" />
          <span className="text-sm text-muted-foreground w-10 text-right">{amplitudeScale.toFixed(1)}x</span>
        </div>

        {/* Time position */}
        <div className="flex items-center gap-4 px-1">
          <span className="text-sm text-muted-foreground w-28">Time position:</span>
          <Slider value={[viewStart]}
            onValueChange={([v]) => setViewStart(v)}
            min={0} max={Math.max(0, duration - visibleDuration)}
            step={visibleDuration / 100} className="flex-1" />
          <span className="text-sm text-muted-foreground w-28 text-right">
            {viewStart.toFixed(1)}s – {viewEnd.toFixed(1)}s
          </span>
        </div>

        {/* Waveform */}
        <div
          ref={waveformRef}
          className="rounded-lg border border-border overflow-hidden bg-card"
          onWheel={handleWheel}
          style={{ touchAction: "pan-y" }}
        >
          <WaveformDisplay />
        </div>

        {/* Anomaly legend */}
        {showAnomalies && anomalies.length > 0 && (
          <div className="flex gap-4 text-xs text-muted-foreground px-1">
            <span className="font-medium text-foreground">Highlights:</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: ANOMALY_COLORS.spike, opacity: 0.8 }} />
              Spike (|z| ≥ 5σ)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: ANOMALY_COLORS.suppression, opacity: 0.8 }} />
              Signal suppression
            </span>
          </div>
        )}

        {/* Channel visibility */}
        <div className="p-3 rounded-lg border border-border bg-secondary/50">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4" />
            Channel Visibility ({Array.from(visibleChannels).length}/{channels.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {channels.map((ch, i) => (
              <button key={ch.name}
                onClick={() => toggleChannel(ch.name)}
                className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
                style={{
                  background: visibleChannels.has(ch.name) ? CHANNEL_COLORS[i % CHANNEL_COLORS.length] + "33" : undefined,
                  borderColor: visibleChannels.has(ch.name) ? CHANNEL_COLORS[i % CHANNEL_COLORS.length] : undefined,
                  color: visibleChannels.has(ch.name) ? CHANNEL_COLORS[i % CHANNEL_COLORS.length] : undefined,
                  opacity: visibleChannels.has(ch.name) ? 1 : 0.4,
                }}>
                {ch.name}
              </button>
            ))}
          </div>
        </div>

        {/* Findings Panel */}
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setShowFindings((v) => !v)}
            className="w-full flex items-center justify-between p-3 bg-secondary/50 hover:bg-secondary/80 transition-colors"
          >
            <span className="font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              EEG Findings
              {anomalies.length > 0 && (
                <Badge variant="destructive" className="text-xs">{anomalies.length} detected</Badge>
              )}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showFindings ? "rotate-180" : ""}`} />
          </button>

          {showFindings && (
            <div className="p-3 space-y-3">
              {anomalies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No anomalies detected in the displayed data.
                </p>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">
                    Detected <span className="text-foreground font-medium">{anomalies.length}</span> potential
                    anomalies across{" "}
                    <span className="text-foreground font-medium">
                      {new Set(anomalies.map((a) => a.channelName)).size}
                    </span>{" "}
                    channels. Enable <span className="text-foreground font-medium">View Anomalies</span> to see
                    highlighted regions on the waveform. Click any finding to jump to that time window.
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {anomalies.map((a, i) => (
                      <button key={i}
                        onClick={() => {
                          setViewStart(Math.max(0, a.timeStart - 1));
                          if (!showAnomalies) setShowAnomalies(true);
                        }}
                        className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md
                          bg-secondary/40 hover:bg-secondary/80 border border-border transition-colors text-sm"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: ANOMALY_COLORS[a.type] }} />
                        <span className="font-mono font-medium w-10 shrink-0">{a.channelName}</span>
                        <span className="text-muted-foreground text-xs">
                          {a.timeStart.toFixed(1)}s – {a.timeEnd.toFixed(1)}s
                        </span>
                        <Badge variant="outline" className="ml-auto text-xs capitalize">{a.type}</Badge>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

export default EEGViewer;
