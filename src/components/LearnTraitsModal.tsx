import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

type TraitKey = "overview" | "attention" | "externalizing" | "internalizing" | "p_factor";

const TRAITS = [
  {
    key: "attention" as const,
    label: "Attention",
    cssVar: "--trait-attention",
    definition:
      "A measure of attentional regulation — how well the brain sustains and directs focus over time. Elevated scores reflect EEG signatures associated with attention control difficulties common in ADHD and related presentations.",
    highMeans: "More pronounced difficulties with sustained focus and concentration.",
    lowMeans: "Better sustained attention, fewer difficulties with focus and concentration regulation.",
  },
  {
    key: "externalizing" as const,
    label: "Externalizing",
    cssVar: "--trait-externalizing",
    definition:
      "Captures tendencies toward outward behavioral dysregulation — impulsivity, aggression, and rule-breaking. The EEG correlates reflect frontal inhibitory control and reward-processing patterns.",
    highMeans: "Stronger tendencies toward behavioral regulation challenges (impulsivity, aggression).",
    lowMeans: "Greater behavioral self-regulation, lower levels of impulsivity and externalizing behavior.",
  },
  {
    key: "internalizing" as const,
    label: "Internalizing",
    cssVar: "--trait-internalizing",
    definition:
      "Reflects emotional distress directed inward — anxiety, depressive symptoms, and social withdrawal. EEG patterns include alpha asymmetry and theta power changes associated with emotional dysregulation.",
    highMeans: "More prominent emotional distress turned inward (anxiety, depression-like patterns).",
    lowMeans: "Lower levels of anxiety, depressive symptoms, and emotional withdrawal tendencies.",
  },
  {
    key: "p_factor" as const,
    label: "p-Factor",
    cssVar: "--trait-pfactor",
    definition:
      "The general psychopathology factor (p-factor) captures shared vulnerability across multiple psychiatric dimensions. It is analogous to a 'g-factor' for mental health — a higher score indicates broader transdiagnostic risk.",
    highMeans: "Higher general vulnerability across multiple psychopathology dimensions.",
    lowMeans: "Lower overall psychopathology vulnerability and greater resilience across dimensions.",
  },
];

const PERCENTILE_TABLE = [
  { range: "< 25th percentile", label: "Well below average", bg: "bg-blue-500/10", text: "text-blue-400" },
  { range: "25th – 39th percentile", label: "Below average", bg: "bg-sky-500/10", text: "text-sky-400" },
  { range: "40th – 60th percentile", label: "Within normal limits", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  { range: "61st – 75th percentile", label: "Above average", bg: "bg-amber-500/10", text: "text-amber-400" },
  { range: "76th – 90th percentile", label: "Notably elevated", bg: "bg-orange-500/10", text: "text-orange-400" },
  { range: "> 90th percentile", label: "Significantly elevated", bg: "bg-red-500/10", text: "text-red-400" },
];

const TABS: { key: TraitKey; label: string; cssVar: string }[] = [
  { key: "overview", label: "Overview", cssVar: "--primary" },
  ...TRAITS.map((t) => ({ key: t.key, label: t.label, cssVar: t.cssVar })),
];

export default function LearnTraitsModal({ open, onClose }: Props) {
  const [selected, setSelected] = useState<TraitKey>("overview");

  const activeTrait = TRAITS.find((t) => t.key === selected) ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">About the EEG Traits</DialogTitle>
        </DialogHeader>

        {/* Trait tabs */}
        <div className="flex flex-wrap gap-2 mt-2 mb-4">
          {TABS.map((t) => {
            const isActive = selected === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setSelected(t.key)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all border ${
                  isActive
                    ? "text-white border-transparent"
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

        {/* Overview — all traits stacked */}
        {selected === "overview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              CogniLink analyzes four neurocognitive dimensions derived from your EEG recording. Each score is expressed as a <strong className="text-foreground">percentile</strong> relative to the normative population — where 50th percentile is the population average.
            </p>
            {TRAITS.map((t) => (
              <div
                key={t.key}
                className="p-4 rounded-xl border border-border bg-secondary/30"
              >
                <div
                  className="font-semibold text-base mb-1"
                  style={{ color: `hsl(var(${t.cssVar}))` }}
                >
                  {t.label}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-2">{t.definition}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Higher: </span>{t.highMeans}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">Lower: </span>{t.lowMeans}
                </p>
              </div>
            ))}

            {/* Percentile table */}
            <div className="mt-2">
              <p className="text-sm font-semibold mb-2">Percentile Interpretation Guide</p>
              <div className="space-y-1.5">
                {PERCENTILE_TABLE.map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg ${row.bg}`}
                  >
                    <span className="text-xs text-muted-foreground">{row.range}</span>
                    <span className={`text-xs font-semibold ${row.text}`}>{row.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Per-trait view */}
        {activeTrait && (
          <div className="space-y-5">
            {/* Trait name + definition */}
            <div>
              <h3
                className="text-2xl font-bold mb-2"
                style={{ color: `hsl(var(${activeTrait.cssVar}))` }}
              >
                {activeTrait.label}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {activeTrait.definition}
              </p>
            </div>

            {/* High / Low means */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-border bg-secondary/30">
                <p className="text-xs font-semibold text-foreground mb-1">Higher scores indicate</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{activeTrait.highMeans}</p>
              </div>
              <div className="p-4 rounded-xl border border-border bg-secondary/30">
                <p className="text-xs font-semibold text-foreground mb-1">Lower scores indicate</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{activeTrait.lowMeans}</p>
              </div>
            </div>

            {/* Percentile interpretation */}
            <div>
              <p className="text-sm font-semibold mb-2">Score Interpretation</p>
              <div className="space-y-1.5">
                {PERCENTILE_TABLE.map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg ${row.bg}`}
                  >
                    <span className="text-xs text-muted-foreground">{row.range}</span>
                    <span className={`text-xs font-semibold ${row.text}`}>{row.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* EEG context note */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">EEG basis: </span>
                Scores are derived from a deep learning model (EEGNeX / LabRaM) trained on 128-channel EEG data from the Healthy Brain Network dataset. They reflect neural signal patterns — not behavioral self-report — and are intended as research-grade indicators only.
              </p>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center mt-4 pt-4 border-t border-border italic">
          These descriptions are for educational purposes. Always consult a qualified clinician for clinical evaluation.
        </p>
      </DialogContent>
    </Dialog>
  );
}
