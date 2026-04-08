import { Stethoscope, AlertTriangle, CheckCircle, Brain } from "lucide-react";

const CONDITION_COLORS: Record<string, string> = {
  ADHD: "hsl(45 95% 55%)",
  OCD: "hsl(280 80% 60%)",
  Anxiety: "hsl(262 80% 65%)",
  Depression: "hsl(340 85% 55%)",
  ASD: "hsl(174 80% 52%)",
  Bipolar: "hsl(15 95% 55%)",
};

const conditions = [
  { name: "ADHD", description: "Attention Deficit Hyperactivity Disorder" },
  { name: "OCD", description: "Obsessive-Compulsive Disorder" },
  { name: "Anxiety", description: "Generalized Anxiety Disorder" },
  { name: "Depression", description: "Major Depressive Disorder" },
  { name: "ASD", description: "Autism Spectrum Disorder" },
  { name: "Bipolar", description: "Bipolar Disorder" },
];

const DiagnosisSection = () => {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Pipeline</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            AI-Powered <span className="gradient-text">Diagnosis</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto font-light">
            Based on the four trait scores (Attention, Externalizing, Internalizing, p-Factor),
            our system generates potential condition diagnoses using pattern recognition.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          {/* Process Flow */}
          <div className="space-y-4">
            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg border border-primary/20 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    <span className="font-mono text-muted-foreground mr-2">●</span>
                    1. Trait Analysis
                  </h3>
                  <p className="text-xs text-muted-foreground">4 core traits extracted from EEG</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {["Attention", "External.", "Internal.", "p-Factor"].map((trait, i) => (
                  <div key={trait} className="text-center p-2 rounded-lg border border-border">
                    <div
                      className="text-lg font-bold font-mono"
                      style={{ color: ["hsl(45 95% 55%)", "hsl(15 95% 55%)", "hsl(280 80% 60%)", "hsl(340 85% 55%)"][i] }}
                    >
                      {[72, 45, 58, 34][i]}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{trait}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-lg border border-accent/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    <span className="font-mono text-muted-foreground mr-2">●</span>
                    2. Pattern Matching
                  </h3>
                  <p className="text-xs text-muted-foreground">AI matches trait profiles to conditions</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground font-light">
                Our deep learning model correlates trait score patterns with established diagnostic criteria
                to identify potential conditions requiring clinical attention.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-lg border border-border flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    <span className="font-mono text-muted-foreground mr-2">●</span>
                    3. Diagnostic Output
                  </h3>
                  <p className="text-xs text-muted-foreground">Potential condition with confidence</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <Stethoscope className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Potential: ADHD (Combined Type)</span>
                <span className="ml-auto text-xs font-mono text-primary">87% conf.</span>
              </div>
            </div>
          </div>

          {/* Conditions Grid */}
          <div>
            <h3 className="font-display text-xl font-semibold mb-6 text-center">Detectable Conditions</h3>
            <div className="grid grid-cols-2 gap-3">
              {conditions.map((condition) => (
                <div
                  key={condition.name}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="font-mono text-sm"
                      style={{ color: CONDITION_COLORS[condition.name] }}
                    >●</span>
                    <div>
                      <div className="font-semibold text-sm group-hover:text-primary transition-colors">
                        {condition.name}
                      </div>
                      <div className="text-xs text-muted-foreground font-light">{condition.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6 font-mono">
              * Diagnoses are AI-assisted and should be confirmed by healthcare professionals
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DiagnosisSection;
