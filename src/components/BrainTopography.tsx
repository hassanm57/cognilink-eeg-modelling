import { useState, useMemo, useEffect } from "react";
import { Brain, Zap, Activity, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExplainabilityData, TraitScores } from "@/services/eegInference";

type TopographyView = "importance" | "alpha" | "theta" | "beta";

interface BrainTopographyProps {
  explainability: ExplainabilityData;
  traitScores?: TraitScores;
}

// 10-20 EEG channel positions on scalp (x, y coordinates in SVG space)
const CHANNEL_POSITIONS: Record<string, { x: number; y: number; region: string }> = {
  Fp1: { x: 120, y: 60, region: "Frontal" },
  Fp2: { x: 180, y: 60, region: "Frontal" },
  F7: { x: 70, y: 100, region: "Frontal" },
  F3: { x: 110, y: 100, region: "Frontal" },
  Fz: { x: 150, y: 90, region: "Frontal" },
  F4: { x: 190, y: 100, region: "Frontal" },
  F8: { x: 230, y: 100, region: "Frontal" },
  T7: { x: 50, y: 150, region: "Temporal" },
  C3: { x: 110, y: 150, region: "Central" },
  Cz: { x: 150, y: 140, region: "Central" },
  C4: { x: 190, y: 150, region: "Central" },
  T8: { x: 250, y: 150, region: "Temporal" },
  P7: { x: 70, y: 200, region: "Parietal" },
  P3: { x: 110, y: 200, region: "Parietal" },
  Pz: { x: 150, y: 190, region: "Parietal" },
  P4: { x: 190, y: 200, region: "Parietal" },
  P8: { x: 230, y: 200, region: "Parietal" },
  O1: { x: 120, y: 240, region: "Occipital" },
  Oz: { x: 150, y: 235, region: "Occipital" },
  O2: { x: 180, y: 240, region: "Occipital" },
};

const VIEW_TYPES = [
  { id: "importance", label: "Channel Importance", icon: Zap, color: "from-blue-500 via-green-500 to-red-500" },
  { id: "alpha", label: "Alpha Power", icon: Activity, color: "from-purple-500 via-yellow-500 to-orange-500" },
  { id: "theta", label: "Theta Power", icon: TrendingUp, color: "from-cyan-500 via-blue-500 to-purple-500" },
  { id: "beta", label: "Beta Power", icon: Brain, color: "from-green-500 via-yellow-500 to-red-500" },
] as const;

const BrainTopography = ({ explainability, traitScores }: BrainTopographyProps) => {
  const [view, setView] = useState<TopographyView>("importance");
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  // Find the top region based on channel importance
  const topRegion = useMemo(() => {
    const regionActivity: Record<string, number[]> = {};
    explainability.important_channels.forEach((ch) => {
      const pos = CHANNEL_POSITIONS[ch.name];
      if (pos) {
        if (!regionActivity[pos.region]) regionActivity[pos.region] = [];
        regionActivity[pos.region].push(ch.importance);
      }
    });
    const regionAverages = Object.entries(regionActivity).map(([region, values]) => ({
      region,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }));
    return regionAverages.sort((a, b) => b.avg - a.avg)[0]?.region || "Frontal";
  }, [explainability]);

  // Fetch AI explanation on mount or when view/region changes
  useEffect(() => {
    if (!traitScores) return;

    const fetchAIExplanation = async () => {
      const LOVABLE_API_KEY = import.meta.env.VITE_LOVABLE_API_KEY;
      if (!LOVABLE_API_KEY) return;

      setLoadingExplanation(true);
      try {
        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are a clinical neuropsychologist. Generate exactly 3 short lines explaining brain topography EEG findings. Be specific, avoid jargon, max 25 words per line.`,
                },
                {
                  role: "user",
                  content: `EEG Trait Scores (percentiles):
- Attention: ${traitScores.attention}
- Externalizing: ${traitScores.externalizing}
- Internalizing: ${traitScores.internalizing}
- p-Factor: ${traitScores.p_factor}

Topography shows highest activity in: ${topRegion} region.
Current view: ${view}.

Give exactly 3 lines explaining:
1. What the heatmap shows
2. Clinical significance
3. Relation to traits

Return ONLY 3 lines, no markdown.`,
                },
              ],
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          setAiExplanation(content.replace(/```/g, "").trim());
        }
      } catch (e) {
        console.error("AI explanation failed:", e);
      } finally {
        setLoadingExplanation(false);
      }
    };

    fetchAIExplanation();
  }, [traitScores, topRegion, view]);

  // Build channel importance map from explainability data
  const channelValues = useMemo(() => {
    const values: Record<string, number> = {};

    if (view === "importance") {
      explainability.important_channels.forEach((ch) => {
        values[ch.name] = ch.importance;
      });
    } else {
      // For frequency bands, distribute power across channels based on region
      const bandPower = explainability.frequency_bands.find((b) => b.band.toLowerCase() === view) || { power: 0.2 };
      const power = bandPower.power;

      // Simulate regional power distribution
      Object.entries(CHANNEL_POSITIONS).forEach(([name, { region }]) => {
        let regionalFactor = 0.5;
        if (view === "alpha" && region === "Occipital") regionalFactor = 1.0;
        if (view === "alpha" && region === "Parietal") regionalFactor = 0.8;
        if (view === "theta" && region === "Frontal") regionalFactor = 0.9;
        if (view === "theta" && region === "Central") regionalFactor = 0.7;
        if (view === "beta" && region === "Frontal") regionalFactor = 0.85;
        if (view === "beta" && region === "Central") regionalFactor = 0.75;

        // Add some variation per channel
        const hash = name.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
        const variation = ((hash % 10) / 10 - 0.5) * 0.3;
        values[name] = Math.min(1, Math.max(0, power * regionalFactor + variation));
      });
    }

    // Fill in missing channels with average
    const existingValues = Object.values(values);
    const avg = existingValues.length > 0 ? existingValues.reduce((a, b) => a + b, 0) / existingValues.length : 0.5;

    Object.keys(CHANNEL_POSITIONS).forEach((name) => {
      if (values[name] === undefined) {
        values[name] = avg;
      }
    });

    return values;
  }, [explainability, view]);

  // Generate heatmap color based on value (0-1)
  const getHeatmapColor = (value: number) => {
    // Blue (low) -> Green (medium) -> Red (high)
    const r = Math.round(value * 255);
    const g = Math.round(Math.sin(value * Math.PI) * 200);
    const b = Math.round((1 - value) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Get explanation text based on view
  const getExplanation = () => {
    const explanations: Record<TopographyView, string> = {
      importance: "Channels with higher saliency indicate greater contribution to the model's prediction. Red/hot regions show where the model focused most when analyzing your EEG patterns.",
      alpha: "Alpha waves (8-13 Hz) are strongest in occipital/parietal regions during relaxed wakefulness. Elevated alpha may indicate calm states or internalized attention patterns.",
      theta: "Theta waves (4-8 Hz) dominate in frontal regions during drowsiness, meditation, or deep internal focus. High frontal theta is often associated with ADHD patterns.",
      beta: "Beta waves (13-30 Hz) reflect active thinking, focus, and alertness. Frontal beta activity indicates cognitive engagement and executive function activation.",
    };
    return explanations[view];
  };

  const maxVal = Math.max(...Object.values(channelValues));
  const minVal = Math.min(...Object.values(channelValues));

  return (
    <div className="space-y-6">
      {/* Main Topography Section */}
      <div className="p-6 rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Brain Topography Map
          </h2>
          <div className="flex gap-1 flex-wrap">
            {VIEW_TYPES.map((v) => {
              const Icon = v.icon;
              return (
                <Button
                  key={v.id}
                  variant={view === v.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView(v.id as TopographyView)}
                  className="text-xs"
                >
                  <Icon className="w-3.5 h-3.5 mr-1" />
                  {v.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center">
          {/* Scalp Map SVG */}
          <div className="w-full flex justify-center mb-6">
            <svg viewBox="0 0 300 280" className="w-full max-w-[350px]">
              {/* Head outline */}
              <ellipse cx="150" cy="150" rx="120" ry="140" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />

              {/* Nose indicator */}
              <path d="M150 55 L155 70 L145 70 Z" fill="hsl(var(--muted-foreground))" />

              {/* Ears */}
              <ellipse cx="35" cy="150" rx="10" ry="20" fill="hsl(var(--muted-foreground))" opacity="0.3" />
              <ellipse cx="265" cy="150" rx="10" ry="20" fill="hsl(var(--muted-foreground))" opacity="0.3" />

              {/* Channel heat circles */}
              {Object.entries(CHANNEL_POSITIONS).map(([name, { x, y }]) => {
                const value = channelValues[name] ?? 0.5;
                const normalizedValue = maxVal > minVal ? (value - minVal) / (maxVal - minVal) : 0.5;
                const isHovered = hoveredChannel === name;

                return (
                  <g key={name}>
                    {/* Invisible larger hit area for smoother hover */}
                    <circle
                      cx={x}
                      cy={y}
                      r={20}
                      fill="transparent"
                      onMouseEnter={() => setHoveredChannel(name)}
                      onMouseLeave={() => setHoveredChannel(null)}
                      className="cursor-pointer"
                    />
                    {/* Heat circle (ignore pointer events so hit-area captures hovers) */}
                    <circle
                      cx={x}
                      cy={y}
                      r={14}
                      fill={getHeatmapColor(normalizedValue)}
                      opacity={0.8}
                      stroke={isHovered ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                      strokeWidth={isHovered ? 2 : 1}
                      pointerEvents="none"
                      className="transition-all duration-200"
                    />
                    {/* Channel label */}
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      className="fill-foreground text-xs font-mono pointer-events-none"
                      fontSize="9"
                      fontWeight={isHovered ? "bold" : "normal"}
                    >
                      {name}
                    </text>
                  </g>
                );
              })}

              {/* Region labels */}
              <text x="150" y="25" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Anterior (Front)</text>
              <text x="150" y="270" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Posterior (Back)</text>
            </svg>
          </div>

          {/* Activity Level Legend - Underneath the map */}
          <div className="w-full max-w-xs">
            <div className="p-3 rounded-xl bg-secondary/50 border border-border">
              <h3 className="text-sm font-medium mb-2 text-center">Activity Level</h3>
              <div className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500 mb-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Details (when hovered) */}
      {hoveredChannel && (
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
          <h3 className="text-sm font-medium mb-2">{hoveredChannel}</h3>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              {CHANNEL_POSITIONS[hoveredChannel]?.region} Region
            </span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${((channelValues[hoveredChannel] ?? 0) * 100).toFixed(0)}%` }}
              />
            </div>
            <span className="text-xs font-medium">
              {((channelValues[hoveredChannel] ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* AI Analysis Section - Separate container below */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          AI Analysis
        </h3>
        {loadingExplanation ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Generating explanation...
          </div>
        ) : aiExplanation ? (
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {aiExplanation}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {getExplanation()}
          </p>
        )}
      </div>
    </div>
  );
};

export default BrainTopography;
