import { Upload, Cpu, Sparkles, BarChart } from "lucide-react";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Upload EEG",
    description: "Upload your 128-channel EEG file (EDF/FIF/HBN format) and select the task type.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "Processing",
    description: "LaBraM generates embeddings with patch tokens and long-range temporal dependencies.",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "Prediction",
    description: "EEGNet produces 4-dimensional predictions with attention weights and saliency maps.",
  },
  {
    icon: BarChart,
    step: "04",
    title: "Visualization",
    description: "Explore interactive visualizations, topography maps, and explainable AI insights.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-32 relative grain">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Process</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            How It <span className="gradient-text">Works</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            From raw EEG data to explainable insights in four simple steps.
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto">
          {/* Plain connection line */}
          <div className="absolute top-[38px] left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] h-px bg-border hidden lg:block" />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((item) => (
              <div key={item.step} className="relative flex flex-col items-center text-center group">
                {/* Step label above icon */}
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                  {item.step}
                </span>

                {/* Icon */}
                <div className="w-14 h-14 rounded-xl border border-border bg-card group-hover:border-primary/30 transition-colors flex items-center justify-center mb-2 relative z-10">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>

                {/* Vertical line below icon */}
                <div className="w-px h-5 bg-border mb-4" />

                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm font-light">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
