const traits = [
  {
    name: "Attention",
    description: "Measures focus, concentration, and sustained attention capabilities based on frontal lobe activity patterns.",
    cssColor: "hsl(45 95% 55%)",
    varName: "--trait-attention",
    percentage: 72,
  },
  {
    name: "Externalizing",
    description: "Assesses behavioral regulation, impulsivity, and external expression of emotions and behaviors.",
    cssColor: "hsl(15 95% 55%)",
    varName: "--trait-externalizing",
    percentage: 45,
  },
  {
    name: "Internalizing",
    description: "Evaluates anxiety, depression markers, and internal emotional processing patterns.",
    cssColor: "hsl(280 80% 60%)",
    varName: "--trait-internalizing",
    percentage: 58,
  },
  {
    name: "p-Factor",
    description: "General psychopathology factor representing overall mental health vulnerability across domains.",
    cssColor: "hsl(340 85% 55%)",
    varName: "--trait-pfactor",
    percentage: 34,
  },
];

const TraitsSection = () => {
  return (
    <section id="traits" className="py-32 relative">
      <div className="rule-line mb-0" />
      <div className="container mx-auto px-6 pt-16">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Predictions</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Four Core <span className="gradient-text">Predictions</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            Our model outputs four scientifically-validated mental health trait scores, visualized for easy interpretation.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {traits.map((trait) => (
            <div
              key={trait.name}
              className="p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="mb-4">
                <h3 className="font-display text-lg font-semibold mb-1" style={{ color: trait.cssColor }}>
                  {trait.name}
                </h3>
                <p className="text-sm text-muted-foreground font-light">{trait.description}</p>
              </div>

              <div className="flex items-center gap-6 mt-4">
                {/* Thin SVG gauge */}
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="hsl(var(--border))"
                      strokeWidth="5"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={trait.cssColor}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${trait.percentage * 2.64} 264`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-xl font-bold">{trait.percentage}</span>
                  </div>
                </div>

                {/* Thin single-color progress bar */}
                <div className="flex-1">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${trait.percentage}%`, background: trait.cssColor }}
                    />
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-2">
                    {trait.percentage}th percentile
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TraitsSection;
