const CONDITIONS_COLORS = [
  "hsl(45 95% 55%)",
  "hsl(280 80% 60%)",
  "hsl(262 80% 65%)",
  "hsl(340 85% 55%)",
  "hsl(174 80% 52%)",
  "hsl(15 95% 55%)",
];

const conditions = [
  { abbr: "ADHD", full: "Attention Deficit Hyperactivity Disorder" },
  { abbr: "OCD", full: "Obsessive-Compulsive Disorder" },
  { abbr: "Anxiety", full: "Generalized Anxiety Disorder" },
  { abbr: "Depression", full: "Major Depressive Disorder" },
  { abbr: "ASD", full: "Autism Spectrum Disorder" },
  { abbr: "Bipolar", full: "Bipolar Disorder" },
];

const ModelPerformanceSection = () => {
  return (
    <section id="performance" className="py-32 relative">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Coverage</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold">
            Detectable <span className="gradient-text">Conditions</span>
          </h2>
        </div>

        {/* Single bordered container with all 6 conditions */}
        <div className="max-w-5xl mx-auto border border-border rounded-2xl overflow-hidden bg-card">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-border">
            {conditions.map((c, i) => (
              <div
                key={c.abbr}
                className="p-6 text-center group hover:bg-secondary/30 transition-colors"
              >
                <div
                  className="text-xl font-display font-bold mb-1"
                  style={{ color: CONDITIONS_COLORS[i] }}
                >
                  {c.abbr}
                </div>
                <div className="text-[10px] text-muted-foreground leading-snug font-light">{c.full}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground font-mono max-w-xl mx-auto mt-6">
          * Diagnoses are AI-assisted and should be confirmed by healthcare professionals
        </p>
      </div>
    </section>
  );
};

export default ModelPerformanceSection;
