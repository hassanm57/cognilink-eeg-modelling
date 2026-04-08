import { Button } from "@/components/ui/button";
import { Brain, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const CTASection = () => {
  return (
    <section className="py-24 border-t border-border">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 max-w-6xl mx-auto">
          <div>
            <p className="section-label mb-4">Get Started</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Ready to Explore<br />
              <span className="gradient-text">Brain Intelligence?</span>
            </h2>
            <p className="text-muted-foreground text-lg font-light max-w-md">
              Access our powerful EEG analysis dashboards and discover insights into mental health traits with explainable AI.
            </p>
          </div>

          <div className="flex flex-col items-center lg:items-end gap-4 shrink-0">
            <Link to="/dashboard">
              <Button size="lg" className="group bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Brain className="w-4 h-4" />
                Go to Dashboard
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground font-mono">
              Visualization-first · Explainable AI · Research-grade
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
