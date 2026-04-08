import { User, Stethoscope } from "lucide-react";

const userFeatures = [
  "EEG upload with guided walkthrough",
  "Animated bar gauges for 4 traits",
  "Plain-language explanations",
  "PDF summary with visuals",
  "Session history timeline",
];

const doctorFeatures = [
  "Patient management system",
  "Multi-level EEG visualizer",
  "Saliency heatmaps & attention maps",
  "Side-by-side test comparison",
  "Clinical notes & technical reports",
];

const DashboardsSection = () => {
  return (
    <section id="dashboards" className="py-32 relative">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Dashboards</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Dual <span className="gradient-text">Dashboards</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            Tailored experiences for both individual users and clinical professionals.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* User Dashboard */}
          <div className="p-8 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold">User Dashboard</h3>
                <p className="text-sm text-muted-foreground">Simple, Intuitive, Visual</p>
              </div>
            </div>

            <p className="text-muted-foreground text-sm mb-6 font-light">
              Designed for parents, individuals, and students who want to understand their brain activity without technical complexity.
            </p>

            <ul className="space-y-3">
              {userFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <span className="text-primary font-mono text-xs">—</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Doctor Dashboard */}
          <div className="p-8 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl border border-accent/20 bg-accent/5 flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold">Doctor Dashboard</h3>
                <p className="text-sm text-muted-foreground">Detailed, Analytical, XAI-heavy</p>
              </div>
            </div>

            <p className="text-muted-foreground text-sm mb-6 font-light">
              For clinicians, researchers, and psychologists who need full interpretability and verification of predictions.
            </p>

            <ul className="space-y-3">
              {doctorFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <span className="text-accent font-mono text-xs">—</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardsSection;
