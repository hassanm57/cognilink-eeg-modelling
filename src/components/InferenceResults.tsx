import { Activity, Brain, AlertTriangle, FileText } from "lucide-react";
import type { InferenceResponse, ConditionConfidences } from "@/services/eegInference";
import EEGWaveformViewer from "./EEGWaveformViewer";
import BrainTopography from "./BrainTopography";
import NormativePercentile from "./NormativePercentile";

interface InferenceResultsProps {
  result: InferenceResponse;
}

const CONDITIONS: { id: keyof ConditionConfidences; abbr: string; full: string }[] = [
  { id: "adhd",       abbr: "ADHD",       full: "Attention Deficit Hyperactivity Disorder" },
  { id: "ocd",        abbr: "OCD",        full: "Obsessive-Compulsive Disorder" },
  { id: "anxiety",    abbr: "Anxiety",    full: "Generalized Anxiety Disorder" },
  { id: "depression", abbr: "Depression", full: "Major Depressive Disorder" },
  { id: "asd",        abbr: "ASD",        full: "Autism Spectrum Disorder" },
  { id: "bipolar",    abbr: "Bipolar",    full: "Bipolar Disorder" },
];

function conditionConfidenceColor(pct: number): string {
  if (pct < 30) return "hsl(142,71%,45%)";   // green
  if (pct < 50) return "hsl(45,95%,55%)";    // amber
  if (pct < 70) return "hsl(25,95%,55%)";    // orange
  return "hsl(0,84%,60%)";                    // red
}

const traitMeta = [
  { key: "attention" as const, name: "Attention", color: "trait-attention", description: "Focus and concentration levels" },
  { key: "externalizing" as const, name: "Externalizing", color: "trait-externalizing", description: "Behavioral regulation" },
  { key: "internalizing" as const, name: "Internalizing", color: "trait-internalizing", description: "Emotional processing" },
  { key: "p_factor" as const, name: "p-Factor", color: "trait-pfactor", description: "General vulnerability" },
];

const riskColors: Record<string, string> = {
  low: "text-neural-green",
  moderate: "text-accent",
  elevated: "text-trait-attention",
  high: "text-destructive",
};

const InferenceResults = ({ result }: InferenceResultsProps) => {
  const { trait_scores, raw_trait_scores, explainability, clinical_notes, disclaimer, eeg_preview, condition_confidences } = result;

  return (
    <div className="space-y-6">
      {/* Predicted Trait Scores — TOP */}
      <div className="p-6 rounded-2xl bg-card border border-border">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Predicted Trait Scores
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {traitMeta.map((trait) => {
            const percentile = Math.round(trait_scores[trait.key]);
            const rawScore = raw_trait_scores?.[trait.key];
            return (
              <div key={trait.key} className="p-4 rounded-xl border border-border bg-secondary/30">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium">{trait.name}</span>
                    <p className="text-xs text-muted-foreground">{trait.description}</p>
                  </div>
                  <span className="text-2xl font-bold" style={{ color: `hsl(var(--${trait.color}))` }}>
                    {percentile}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${percentile}%`, backgroundColor: `hsl(var(--${trait.color}))` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Percentile: {percentile}th</span>
                  {rawScore !== undefined && (
                    <span>Raw: {rawScore.toFixed(3)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Condition Confidence Predictions */}
      {condition_confidences && (
        <div className="p-6 rounded-2xl bg-card border border-border">
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Condition Confidence Predictions
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            Estimated likelihood that the EEG pattern is consistent with each condition. Independent probabilities — not mutually exclusive.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {CONDITIONS.map(({ id, abbr, full }) => {
              const pct = Math.round(condition_confidences[id] ?? 0);
              const color = conditionConfidenceColor(pct);
              return (
                <div key={id} className="p-4 rounded-xl border border-border bg-secondary/30">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="font-semibold text-sm">{abbr}</span>
                      <p className="text-[10px] text-muted-foreground leading-tight">{full}</p>
                    </div>
                    <span className="text-xl font-bold font-mono" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 italic text-center">
            * Diagnoses are AI-assisted and should be confirmed by healthcare professionals
          </p>
        </div>
      )}

      {/* Normative Percentile Ranking */}
      <NormativePercentile trait_scores={trait_scores} />

      {/* EEG Waveform Viewer */}
      {eeg_preview && eeg_preview.channels.length > 0 && (
        <EEGWaveformViewer data={eeg_preview} />
      )}

      {/* Brain Topography Map */}
      {explainability?.important_channels?.length > 0 && (
        <BrainTopography explainability={explainability} traitScores={trait_scores} />
      )}

      {/* Clinical Notes */}
      {clinical_notes && (
        <div className="p-6 rounded-2xl bg-card border border-border">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Clinical Notes
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{clinical_notes}</p>
        </div>
      )}

      {/* Explainability — Channel Importance */}
      {explainability?.important_channels?.length > 0 && (
        <div className="p-6 rounded-2xl bg-card border border-border">
          <h2 className="text-lg font-semibold mb-4">Channel Importance (Saliency)</h2>
          <div className="space-y-3">
            {explainability.important_channels.slice(0, 10).map((ch) => (
              <div key={ch.name} className="flex items-center gap-4">
                <div className="w-12 text-sm font-mono font-medium">{ch.name}</div>
                <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${ch.importance * 100}%` }}
                  />
                </div>
                <div className="w-16 text-sm text-right">{(ch.importance * 100).toFixed(0)}%</div>
                <div className="w-32 text-xs text-muted-foreground">{ch.region}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explainability — Frequency Bands */}
      {explainability?.frequency_bands?.length > 0 && (
        <div className="p-6 rounded-2xl bg-card border border-border">
          <h2 className="text-lg font-semibold mb-4">Frequency Band Power</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {explainability.frequency_bands.map((band) => (
              <div key={band.band} className="p-3 rounded-xl bg-secondary/50 text-center">
                <div className="text-xs text-muted-foreground mb-1">{band.band}</div>
                <div className="text-lg font-bold text-primary">{(band.power * 100).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">{band.range}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="p-4 rounded-xl bg-secondary/50 border border-border">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium mb-1">Research Disclaimer</p>
            <p className="text-xs text-muted-foreground">
              {disclaimer || "These outputs are research-oriented risk indicators, not clinical diagnoses. Please consult a qualified healthcare professional for clinical evaluation."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InferenceResults;
