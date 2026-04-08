import { useState } from "react";
import type { TraitScores } from "@/services/eegInference";
import { BarChart2 } from "lucide-react";

interface Props {
  trait_scores: TraitScores;
}

type TraitKey = "overall" | "attention" | "externalizing" | "internalizing" | "p_factor";

// Peter Acklam rational approximation — accurate to 1.15×10⁻⁹
function probit(p: number): number {
  const q = Math.max(0.001, Math.min(0.999, p / 100));
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
     1.383577518672690e+02, -3.066479806614716e+01,  2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
     6.680131188771972e+01, -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00,  4.374664141464968e+00,  2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,  3.224671290700398e-01,
    2.445134137142996e+00,  3.754408661907416e+00,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (q < pLow) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0]*r+c[1])*r+c[2])*r+c[3])*r+c[4])*r+c[5]) /
           ((((d[0]*r+d[1])*r+d[2])*r+d[3])*r+1);
  }
  if (q <= pHigh) {
    const r2 = (q - 0.5) ** 2;
    return ((((((a[0]*r2+a[1])*r2+a[2])*r2+a[3])*r2+a[4])*r2+a[5]) * (q - 0.5)) /
           (((((b[0]*r2+b[1])*r2+b[2])*r2+b[3])*r2+b[4])*r2+1);
  }
  const r = Math.sqrt(-2 * Math.log(1 - q));
  return -((((((c[0]*r+c[1])*r+c[2])*r+c[3])*r+c[4])*r+c[5]) /
           ((((d[0]*r+d[1])*r+d[2])*r+d[3])*r+1));
}

const pdf = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

// SVG layout constants
const W = 560;
const H = 200;
const pad = { top: 16, bottom: 40, left: 20, right: 20 };
const innerW = W - pad.left - pad.right;
const innerH = H - pad.top - pad.bottom;
const PDF_PEAK = 0.401; // pdf(0)

const zToX = (z: number) => pad.left + ((z + 3.5) / 7) * innerW;
const pdfToY = (y: number) => pad.top + innerH - (y / PDF_PEAK) * innerH;

// Generate the full bell curve path
function bellPath(): string {
  const pts: string[] = [];
  const steps = 280;
  for (let i = 0; i <= steps; i++) {
    const z = -3.5 + (7 * i) / steps;
    const x = zToX(z);
    const y = pdfToY(pdf(z));
    pts.push(i === 0 ? `M ${x},${y}` : `L ${x},${y}`);
  }
  return pts.join(" ");
}

// Generate shaded area path up to userZ
function shadedPath(userZ: number): string {
  const pts: string[] = [];
  const steps = 280;
  const clampedZ = Math.max(-3.49, Math.min(3.49, userZ));
  for (let i = 0; i <= steps; i++) {
    const z = -3.5 + (7 * i) / steps;
    if (z > clampedZ) break;
    const x = zToX(z);
    const y = pdfToY(pdf(z));
    pts.push(i === 0 ? `M ${x},${y}` : `L ${x},${y}`);
  }
  const endX = zToX(clampedZ);
  const baseY = pdfToY(0);
  pts.push(`L ${endX},${baseY}`);
  pts.push(`L ${zToX(-3.5)},${baseY}`);
  pts.push("Z");
  return pts.join(" ");
}

// X-axis percentile labels
const AXIS_PERCENTILES = [1, 10, 25, 50, 75, 90, 99];

const TRAIT_META: {
  key: TraitKey;
  label: string;
  shortLabel: string;
  cssVar: string;
  fallbackColor: string;
  highMeans: string;
  lowMeans: string;
}[] = [
  {
    key: "overall",
    label: "Overall",
    shortLabel: "All",
    cssVar: "--primary",
    fallbackColor: "#818cf8",
    highMeans: "",
    lowMeans: "",
  },
  {
    key: "attention",
    label: "Attention",
    shortLabel: "Att",
    cssVar: "--trait-attention",
    fallbackColor: "#f59e0b",
    highMeans: "More pronounced difficulties with sustained focus and concentration.",
    lowMeans: "Better sustained attention, fewer difficulties with focus and concentration regulation.",
  },
  {
    key: "externalizing",
    label: "Externalizing",
    shortLabel: "Ext",
    cssVar: "--trait-externalizing",
    fallbackColor: "#ef4444",
    highMeans: "Stronger tendencies toward behavioral regulation challenges (impulsivity, aggression).",
    lowMeans: "Greater behavioral self-regulation, lower levels of impulsivity and externalizing behavior.",
  },
  {
    key: "internalizing",
    label: "Internalizing",
    shortLabel: "Int",
    cssVar: "--trait-internalizing",
    fallbackColor: "#8b5cf6",
    highMeans: "More prominent emotional distress turned inward (anxiety, depression-like patterns).",
    lowMeans: "Lower levels of anxiety, depressive symptoms, and emotional withdrawal tendencies.",
  },
  {
    key: "p_factor",
    label: "p-Factor",
    shortLabel: "p",
    cssVar: "--trait-pfactor",
    fallbackColor: "#06b6d4",
    highMeans: "Higher general vulnerability across multiple psychopathology dimensions.",
    lowMeans: "Lower overall psychopathology vulnerability and greater resilience across dimensions.",
  },
];

function percentileLabel(p: number): string {
  if (p < 25) return "Well below average";
  if (p < 40) return "Below average";
  if (p < 60) return "Within normal limits";
  if (p < 75) return "Above average";
  if (p < 90) return "Notably elevated";
  return "Significantly elevated";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const BELL_PATH = bellPath();

export default function NormativePercentile({ trait_scores }: Props) {
  const [selected, setSelected] = useState<TraitKey>("overall");

  const scores: Record<Exclude<TraitKey, "overall">, number> = {
    attention: Math.round(trait_scores.attention),
    externalizing: Math.round(trait_scores.externalizing),
    internalizing: Math.round(trait_scores.internalizing),
    p_factor: Math.round(trait_scores.p_factor),
  };

  const traitList = TRAIT_META.filter((t) => t.key !== "overall") as (typeof TRAIT_META[number] & {
    key: Exclude<TraitKey, "overall">;
  })[];

  const selectedMeta = TRAIT_META.find((t) => t.key === selected)!;

  // For per-trait mode
  const singleScore = selected !== "overall" ? scores[selected as Exclude<TraitKey, "overall">] : null;
  const singleZ = singleScore !== null ? probit(singleScore) : 0;

  // Overall: find range
  const allScores = Object.values(scores);
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);

  const baseY = pdfToY(0);

  return (
    <div className="p-6 rounded-2xl bg-card border border-border">
      <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-primary" />
        Normative Percentile Ranking
      </h2>
      <p className="text-xs text-muted-foreground mb-5">
        Where your brain profile sits relative to the normative population
      </p>

      {/* Trait filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TRAIT_META.map((t) => {
          const isActive = selected === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSelected(t.key)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all border ${
                isActive
                  ? "text-primary-foreground border-transparent shadow-md"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              }`}
              style={
                isActive
                  ? { backgroundColor: `hsl(var(${t.cssVar}))`, borderColor: `hsl(var(${t.cssVar}))` }
                  : {}
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Bell curve SVG */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-2xl mx-auto block"
          aria-label="Bell curve distribution"
        >
          {/* Shaded area — per-trait only */}
          {selected !== "overall" && singleScore !== null && (
            <path
              d={shadedPath(singleZ)}
              fill={`hsl(var(${selectedMeta.cssVar}))`}
              fillOpacity={0.22}
            />
          )}

          {/* Bell curve outline */}
          <path
            d={BELL_PATH}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1.5}
          />

          {/* X-axis baseline */}
          <line
            x1={pad.left}
            y1={baseY}
            x2={W - pad.right}
            y2={baseY}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />

          {/* X-axis labels */}
          {AXIS_PERCENTILES.map((pct) => {
            const z = probit(pct);
            const x = zToX(z);
            return (
              <g key={pct}>
                <line
                  x1={x}
                  y1={baseY}
                  x2={x}
                  y2={baseY + 4}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={baseY + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="hsl(var(--muted-foreground))"
                  fontFamily="monospace"
                >
                  {pct}th
                </text>
              </g>
            );
          })}

          {/* Per-trait: single marker */}
          {selected !== "overall" && singleScore !== null && (() => {
            const x = zToX(singleZ);
            const topY = pdfToY(pdf(singleZ));
            const chipW = 88;
            const chipH = 20;
            const chipX = Math.max(pad.left + 2, Math.min(W - pad.right - chipW - 2, x - chipW / 2));
            const chipY = Math.max(pad.top, topY - chipH - 8);
            return (
              <g>
                <line
                  x1={x} y1={topY - 4}
                  x2={x} y2={baseY}
                  stroke={`hsl(var(${selectedMeta.cssVar}))`}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={x} cy={topY - 4}
                  r={4}
                  fill={`hsl(var(${selectedMeta.cssVar}))`}
                />
                {/* Chip */}
                <rect
                  x={chipX} y={chipY}
                  width={chipW} height={chipH}
                  rx={4}
                  fill={`hsl(var(${selectedMeta.cssVar}))`}
                  fillOpacity={0.9}
                />
                <text
                  x={chipX + chipW / 2}
                  y={chipY + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="600"
                  fill="hsl(var(--primary-foreground))"
                  fontFamily="sans-serif"
                >
                  {ordinal(singleScore)} pctile
                </text>
              </g>
            );
          })()}

          {/* Overall: 4 colored dotted markers */}
          {selected === "overall" &&
            traitList.map((t) => {
              const pct = scores[t.key];
              const z = probit(pct);
              const x = zToX(z);
              const topY = pdfToY(pdf(z));
              return (
                <g key={t.key}>
                  <line
                    x1={x} y1={topY}
                    x2={x} y2={baseY}
                    stroke={`hsl(var(${t.cssVar}))`}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <circle
                    cx={x} cy={topY - 2}
                    r={3.5}
                    fill={`hsl(var(${t.cssVar}))`}
                  />
                </g>
              );
            })}
        </svg>
      </div>

      {/* Overall legend */}
      {selected === "overall" && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center mb-2">
            {traitList.map((t) => (
              <div key={t.key} className="flex items-center gap-1.5 text-sm">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: `hsl(var(${t.cssVar}))` }}
                />
                <span className="text-muted-foreground">{t.label}</span>
                <span className="font-semibold">{ordinal(scores[t.key])}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Your scores span the{" "}
            <span className="font-semibold text-foreground">{ordinal(minScore)}</span>
            {" – "}
            <span className="font-semibold text-foreground">{ordinal(maxScore)}</span>
            {" "}percentile range.
          </p>
        </div>
      )}

      {/* Per-trait interpretive block */}
      {selected !== "overall" && singleScore !== null && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Large percentile display */}
          <div className="flex-shrink-0 text-center sm:text-left">
            <div
              className="text-4xl font-bold tabular-nums leading-none"
              style={{ color: `hsl(var(${selectedMeta.cssVar}))` }}
            >
              {ordinal(singleScore)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">percentile</div>
          </div>

          <div className="flex-1 space-y-2">
            {/* Interpretation label */}
            <div
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: `hsl(var(${selectedMeta.cssVar}) / 0.15)`,
                color: `hsl(var(${selectedMeta.cssVar}))`,
              }}
            >
              {percentileLabel(singleScore)}
            </div>

            {/* High / Low score meaning */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Higher scores indicate: </span>
              {selectedMeta.highMeans}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Lower scores indicate: </span>
              {selectedMeta.lowMeans}
            </p>

            {/* Context sentence */}
            <p className="text-xs text-muted-foreground">
              A score at the {ordinal(singleScore)} percentile means this individual scored higher than{" "}
              {singleScore}% of the normative reference population on the{" "}
              {selectedMeta.label} dimension.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
