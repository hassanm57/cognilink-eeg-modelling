import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, ArrowRight, ArrowLeft, Loader2, User, Stethoscope } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AUTH_DATA_POINTS = [
  { label: "EEG Channels", value: "128" },
  { label: "Trait Predictions", value: "4" },
  { label: "Detectable Conditions", value: "10+" },
];

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("user");
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const { user, role, loading: authLoading, signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user && role) {
      setTransitioning(true);
      const timer = setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, role, authLoading, navigate]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Check your email",
        description: "We sent a password reset link to your inbox.",
      });
      setIsForgotPassword(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, selectedRole, displayName);
        if (error) throw error;
        toast({
          title: "Account created",
          description: "Please check your email to verify your account.",
        });
        setLoading(false);
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      toast({
        title: isSignUp ? "Sign up failed" : "Sign in failed",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsSignUp((v) => !v);
    setEmail("");
    setPassword("");
    setDisplayName("");
  };

  return (
    <div
      className={`min-h-screen bg-background flex transition-opacity duration-500 ${transitioning ? "opacity-0" : "opacity-100"}`}
    >
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] flex-col border-r border-border bg-card grain relative overflow-hidden">
        {/* Subtle radial gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 20% 30%, hsl(var(--primary) / 0.08), transparent)" }}
        />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-auto">
            <Brain className="w-6 h-6 text-primary" />
            <span className="font-display font-semibold text-lg">Cognilink</span>
          </div>

          {/* Brand statement */}
          <div className="py-16">
            <p className="section-label mb-6">EEG Psychopathology Analysis</p>
            <h2 className="font-display text-4xl font-bold leading-tight mb-6">
              Clinical-grade<br />
              <span className="gradient-text">brain intelligence</span><br />
              for everyone.
            </h2>
            <p className="text-muted-foreground font-light leading-relaxed max-w-xs">
              Upload an EEG file and receive AI-powered trait predictions, interactive waveform analysis, and explainable diagnoses.
            </p>
          </div>

          {/* Data points */}
          <div className="flex gap-8 mb-8">
            {AUTH_DATA_POINTS.map(({ label, value }) => (
              <div key={label}>
                <div className="font-display text-2xl font-bold text-primary">{value}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Mono footer */}
          <div className="border-t border-border pt-6">
            <p className="font-mono text-[10px] text-muted-foreground">
              NUST · Research Platform · v2.0
            </p>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Back to home */}
        <Link
          to="/"
          className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center group-hover:border-primary/50 group-hover:bg-primary/5 transition-all">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="text-xs font-medium opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">Home</span>
        </Link>

        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1 lg:hidden">
              <Brain className="w-5 h-5 text-primary" />
              <span className="font-display font-semibold">Cognilink</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight mb-1">
              {isForgotPassword ? "Reset password" : isSignUp ? "Create account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isForgotPassword
                ? "We'll send a reset link to your inbox."
                : isSignUp
                ? "Sign up to access the platform."
                : "Sign in to your account."}
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            {!isForgotPassword && (
              /* Mode toggle tabs */
              <div className="flex border-b border-border">
                {(["Sign In", "Sign Up"] as const).map((label) => {
                  const active = label === "Sign In" ? !isSignUp : isSignUp;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if ((label === "Sign In" && isSignUp) || (label === "Sign Up" && !isSignUp)) {
                          handleToggleMode();
                        }
                      }}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${
                        active
                          ? "text-foreground border-b-2 border-primary -mb-px"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-6">
              {!isForgotPassword && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Sign-up only fields */}
                  <div
                    className={`space-y-4 overflow-hidden transition-all duration-500 ease-in-out ${
                      isSignUp ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                    }`}
                  >
                    {/* Role selector */}
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                        I am a
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { role: "user" as AppRole, label: "Patient / User", Icon: User },
                          { role: "doctor" as AppRole, label: "Doctor", Icon: Stethoscope },
                        ] as const).map(({ role: r, label, Icon }) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setSelectedRole(r)}
                            className={`p-4 rounded-lg border text-sm font-medium transition-colors flex flex-col items-center gap-2 ${
                              selectedRole === r
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Full name */}
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                        Full Name
                      </label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={selectedRole === "doctor" ? "Dr. Jane Smith" : "Jane Smith"}
                        className="bg-secondary/20 border-border focus:border-primary/60 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      Email
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="bg-secondary/20 border-border focus:border-primary/60 transition-colors"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      Password
                    </label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="bg-secondary/20 border-border focus:border-primary/60 transition-colors"
                    />
                  </div>

                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                    >
                      Forgot password?
                    </button>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {isSignUp ? "Create Account" : "Sign In"}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* Forgot password form */}
              {isForgotPassword && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-sm text-muted-foreground font-light">Enter your email and we'll send you a reset link.</p>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="bg-secondary/20 border-border focus:border-primary/60 transition-colors"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(false)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back to sign in
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-5 leading-relaxed font-mono">
            By continuing you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
