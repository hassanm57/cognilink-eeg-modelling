import { useMemo, useState, useRef, useCallback } from "react";
import { Activity, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EEGPreviewData } from "@/services/eegInference";

interface EEGWaveformViewerProps {
  data: EEGPreviewData;
}

const CHANNEL_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--trait-attention))",
  "hsl(var(--trait-externalizing))",
  "hsl(var(--trait-internalizing))",
  "hsl(var(--trait-pfactor))",
  "hsl(var(--neural-green))",
  "hsl(var(--primary) / 0.7)",
];

const EEGWaveformViewer = ({ data }: EEGWaveformViewerProps) => {
  const { channels, sfreq, duration } = data;

  const [viewStart, setViewStart] = useState(0); // in samples
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredSample, setHoveredSample] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const totalSamples = channels[0]?.data.length || 0;
  const visibleSamples = Math.max(50, Math.floor(totalSamples / zoomLevel));
  const viewEnd = Math.min(viewStart + visibleSamples, totalSamples);

  const channelHeight = 70;
  const padding = { top: 10, bottom: 10, left: 55, right: 20 };
  const width = 900;
  const totalHeight = channels.length * channelHeight + padding.top + padding.bottom;

  const paths = useMemo(() => {
    return channels.map((ch) => {
      const points = ch.data.slice(viewStart, viewEnd);
      if (points.length < 2) return "";

      const yCenter = padding.top + channels.indexOf(ch) * channelHeight + channelHeight / 2;
      const xScale = (width - padding.left - padding.right) / (points.length - 1);

      const min = Math.min(...points);
      const max = Math.max(...points);
      const range = max - min || 1;
      const amplitude = channelHeight * 0.4;

      return points
        .map((v, i) => {
          const x = padding.left + i * xScale;
          const y = yCenter - ((v - min) / range - 0.5) * 2 * amplitude;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    });
  }, [channels, viewStart, viewEnd, width]);

  const timeLabels = useMemo(() => {
    const startTime = viewStart / sfreq;
    const endTime = viewEnd / sfreq;
    const visibleDuration = endTime - startTime;
    const count = Math.min(8, Math.max(3, Math.floor(visibleDuration) + 1));
    return Array.from({ length: count }, (_, i) => {
      const t = startTime + (i / (count - 1)) * visibleDuration;
      return {
        x: padding.left + (i / (count - 1)) * (width - padding.left - padding.right),
        label: `${t.toFixed(2)}s`,
      };
    });
  }, [viewStart, viewEnd, sfreq, width]);

  const handleZoomIn = () => {
    setZoomLevel((z) => Math.min(z * 2, 32));
  };

  const handleZoomOut = () => {
    setZoomLevel((z) => {
      const newZ = Math.max(z / 2, 1);
      // Clamp viewStart
      const newVisible = Math.floor(totalSamples / newZ);
      setViewStart((s) => Math.min(s, Math.max(0, totalSamples - newVisible)));
      return newZ;
    });
  };

  const handleReset = () => {
    setZoomLevel(1);
    setViewStart(0);
    setHoveredSample(null);
  };

  // Pan with mouse drag
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartView = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartView.current = viewStart;
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStartX.current;
      const samplesPerPixel = visibleSamples / (rect.width * (width - padding.left - padding.right) / width);
      const sampleDelta = Math.round(-dx * samplesPerPixel);
      const newStart = Math.max(0, Math.min(dragStartView.current + sampleDelta, totalSamples - visibleSamples));
      setViewStart(newStart);
    }

    // Hover cursor
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * width;
      if (svgX >= padding.left && svgX <= width - padding.right) {
        const frac = (svgX - padding.left) / (width - padding.left - padding.right);
        const sample = viewStart + Math.round(frac * (viewEnd - viewStart - 1));
        setHoveredSample(sample);
      } else {
        setHoveredSample(null);
      }
    }
  }, [viewStart, viewEnd, visibleSamples, totalSamples, width]);

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel((z) => Math.min(z * 1.3, 32));
    } else {
      setZoomLevel((z) => {
        const newZ = Math.max(z / 1.3, 1);
        const newVisible = Math.floor(totalSamples / newZ);
        setViewStart((s) => Math.min(s, Math.max(0, totalSamples - newVisible)));
        return newZ;
      });
    }
  }, [totalSamples]);

  // Cursor line x position
  const cursorX = useMemo(() => {
    if (hoveredSample === null) return null;
    const localIdx = hoveredSample - viewStart;
    const pointCount = viewEnd - viewStart;
    if (localIdx < 0 || localIdx >= pointCount) return null;
    return padding.left + (localIdx / (pointCount - 1)) * (width - padding.left - padding.right);
  }, [hoveredSample, viewStart, viewEnd, width]);

  return (
    <div className="p-6 rounded-2xl bg-card border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          EEG Waveform Viewer
          <span className="text-xs bg-secondary px-2 py-1 rounded ml-2 text-muted-foreground">
            {duration}s • {sfreq} Hz • {channels.length} ch
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          {zoomLevel > 1 && (
            <span className="text-xs text-muted-foreground ml-1">{zoomLevel.toFixed(1)}x</span>
          )}
        </div>
      </div>

      {/* Hover info */}
      {hoveredSample !== null && (
        <div className="mb-2 text-xs text-muted-foreground flex gap-4 flex-wrap">
          <span>Time: {(hoveredSample / sfreq).toFixed(3)}s</span>
          {channels.map((ch, i) => {
            const val = ch.data[hoveredSample];
            return val !== undefined ? (
              <span key={ch.name} style={{ color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}>
                {ch.name}: {(val * 1e6).toFixed(1)}µV
              </span>
            ) : null;
          })}
        </div>
      )}

      <div
        className="overflow-hidden rounded-xl border border-border bg-secondary/20 select-none"
        style={{ cursor: zoomLevel > 1 ? "grab" : "crosshair" }}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${totalHeight + 20}`}
          className="w-full min-w-[600px]"
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { handleMouseUp(); setHoveredSample(null); }}
        >
          {/* Channel labels and waveforms */}
          {channels.map((ch, i) => {
            const yCenter = padding.top + i * channelHeight + channelHeight / 2;
            return (
              <g key={ch.name}>
                <line
                  x1={padding.left} y1={yCenter}
                  x2={width - padding.right} y2={yCenter}
                  stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="4,4"
                />
                <text
                  x={padding.left - 6} y={yCenter + 4}
                  textAnchor="end" className="fill-muted-foreground"
                  fontSize="10" fontFamily="monospace"
                >
                  {ch.name}
                </text>
                <path
                  d={paths[i]}
                  fill="none"
                  stroke={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              </g>
            );
          })}

          {/* Cursor line */}
          {cursorX !== null && (
            <line
              x1={cursorX} y1={padding.top}
              x2={cursorX} y2={totalHeight}
              stroke="hsl(var(--primary))" strokeWidth="1" opacity={0.6}
              strokeDasharray="3,3"
            />
          )}

          {/* Time axis */}
          {timeLabels.map((tl, i) => (
            <g key={i}>
              <line
                x1={tl.x} y1={padding.top}
                x2={tl.x} y2={totalHeight}
                stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2,4"
              />
              <text
                x={tl.x} y={totalHeight + 14}
                textAnchor="middle" className="fill-muted-foreground" fontSize="9"
              >
                {tl.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Scroll bar for zoomed view */}
      {zoomLevel > 1 && (
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/40 transition-all"
            style={{
              width: `${(100 / zoomLevel)}%`,
              marginLeft: `${(viewStart / totalSamples) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default EEGWaveformViewer;
