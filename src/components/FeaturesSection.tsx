import { Activity, Brain, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Activity,
    step: "01",
    title: "EEG Waveform Viewer",
    description: "Scrollable multi-channel display with zoom, pan, and channel highlighting. Overlay stimulus events in real-time.",
    color: "hsl(var(--primary))",
  },
  {
    icon: Brain,
    step: "02",
    title: "Scalp Topography Maps",
    description: "Interactive heatmaps showing brain region activation. Alpha, beta, and gamma power projections.",
    color: "hsl(var(--accent))",
  },
  {
    icon: BarChart3,
    step: "03",
    title: "Trait Score Visualization",
    description: "Circular gauges, severity gradients, percentile curves, and population-level comparisons.",
    color: "hsl(var(--trait-attention))",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-32 relative">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Explainability</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Visual-First <span className="gradient-text">Explainability</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            Not a black box — see exactly how the model interprets your brain activity through rich, interactive visualizations.
          </p>
        </div>

        {/* Single bordered panel with vertical dividers */}
        <div className="max-w-5xl mx-auto border border-border rounded-2xl overflow-hidden bg-card">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
            {features.map((feature, index) => (
              <div key={feature.title} className="relative flex-1 p-8">
                {/* Large decorative step number */}
                <span
                  className="absolute top-4 right-6 font-display text-7xl font-bold leading-none select-none pointer-events-none"
                  style={{ color: "hsl(var(--border) / 0.3)" }}
                >
                  {feature.step}
                </span>

                <div
                  className="w-10 h-10 rounded-lg border flex items-center justify-center mb-5"
                  style={{ borderColor: `${feature.color}30`, background: `${feature.color}10` }}
                >
                  <feature.icon className="w-5 h-5" style={{ color: feature.color }} />
                </div>

                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm font-light leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
