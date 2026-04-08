import { Button } from "@/components/ui/button";
import { Brain, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const traitReadout = [
  { label: "ATTENTION", value: "72nd", color: "hsl(45 95% 55%)" },
  { label: "EXTERNALIZING", value: "45th", color: "hsl(15 95% 55%)" },
  { label: "INTERNALIZING", value: "58th", color: "hsl(280 80% 60%)" },
  { label: "P-FACTOR", value: "34th", color: "hsl(340 85% 55%)" },
];

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-14">
      {/* Subtle static radial fog */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 50% at 30% 40%, hsl(var(--primary) / 0.06), transparent)" }}
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className="lg:grid lg:grid-cols-[1fr_auto] lg:gap-20 lg:items-center max-w-6xl mx-auto">
          {/* Left — text */}
          <div>
            <p className="section-label reveal-up delay-0 mb-5">EEG Psychopathology Analysis</p>

            <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6 reveal-up delay-1">
              See Your Brain.<br />
              <span className="gradient-text">Understand Your Mind.</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-10 reveal-up delay-2 font-light">
              Transform raw EEG signals into interactive visualizations and explainable predictions of mental health traits with AI-powered diagnosis.
            </p>

            <div className="reveal-up delay-3 mb-16">
              <Link to="/dashboard">
                <Button size="lg" className="group bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Brain className="w-4 h-4" />
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-10 reveal-up delay-4">
              <div>
                <div className="font-display text-3xl font-bold text-accent">4</div>
                <div className="text-xs text-muted-foreground mt-0.5">Trait Predictions</div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <div className="font-display text-3xl font-bold text-neural-green">128</div>
                <div className="text-xs text-muted-foreground mt-0.5">EEG Channels</div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <div className="font-display text-3xl font-bold" style={{ color: "hsl(var(--trait-attention))" }}>10+</div>
                <div className="text-xs text-muted-foreground mt-0.5">Conditions</div>
              </div>
            </div>
          </div>

          {/* Right — static trait readout panel */}
          <div className="hidden lg:block reveal-up delay-5">
            <div className="border border-border rounded-xl bg-card/60 overflow-hidden w-64">
              <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Sample Output</span>
              </div>
              <div className="divide-y divide-border">
                {traitReadout.map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3">
                    <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
                    <span className="font-mono text-sm font-semibold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">DIAGNOSIS</span>
                  <span className="text-[10px] font-mono text-primary">87% conf.</span>
                </div>
                <p className="font-mono text-[11px] text-foreground leading-snug">ADHD — Combined Type</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
