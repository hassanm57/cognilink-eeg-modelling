import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, Activity, FileText, History, Info, Download, ArrowLeft, Eye, User, LogOut, Shield, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import EEGUploadPanel from "@/components/EEGUploadPanel";
import InferenceResults from "@/components/InferenceResults";
import EEGViewer from "@/components/EEGViewer";
import LearnTraitsModal from "@/components/LearnTraitsModal";
import { useEEGInference } from "@/hooks/useEEGInference";
import { fetchSessions, saveSession, type SessionRecord, type SavedEEGChannels } from "@/services/sessionHistory";
import type { EEGTaskId, EEGModelId, InferenceResponse } from "@/services/eegInference";
import { generatePDFReport } from "@/utils/generatePDF";
import { parseBDF } from "@/utils/parseBDF";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const UserDashboard = () => {
  const { user, signOut } = useAuth();
  const { status, progress, result, error, submitEEG, reset } = useEEGInference();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [viewingSession, setViewingSession] = useState<SessionRecord | null>(null);

  // Generate orb positions once on mount — prevents re-randomising on every re-render
  // (progress updates cause re-renders, which previously reset all Math.random() calls)
  const orbs = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: i * 0.4,
        duration: 5 + Math.random() * 5,
      })),
    []
  );
  const [lastSubmitMeta, setLastSubmitMeta] = useState<{ fileName: string; taskName: string; modelName: string; age?: number; sex?: string } | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mainTab, setMainTab] = useState<"analysis" | "eeg-viewer">("analysis");
  const [showLearnTraits, setShowLearnTraits] = useState(false);
  const { toast } = useToast();

  // Parsed EEG channel data — a Promise stored so the save effect can await it
  // regardless of whether BDF parsing finishes before or after inference
  const parsedEEGPromiseRef = useRef<Promise<SavedEEGChannels | null>>(Promise.resolve(null));

  // Load sessions once the authenticated user is available (re-runs on sign-in edge cases)
  useEffect(() => {
    if (user) fetchSessions().then(setSessions);
  }, [user]);

  // Save session when inference completes — await EEG parse Promise first so
  // waveform data is always included even if parsing took longer than expected
  useEffect(() => {
    if (status === "complete" && result && lastSubmitMeta) {
      const meta = lastSubmitMeta;
      setLastSubmitMeta(null);

      parsedEEGPromiseRef.current.then((eegChannels) => {
        saveSession({
          fileName: meta.fileName,
          taskName: meta.taskName,
          modelName: meta.modelName,
          result,
          subjectAge: meta.age,
          subjectSex: meta.sex,
          eegChannels,
        }).then(({ error: saveError }) => {
          if (saveError) {
            toast({
              title: "Session not saved",
              description: saveError,
              variant: "destructive",
            });
            return; // Don't refetch if save failed — avoid showing stale data as if it were saved
          }
          fetchSessions().then(setSessions);
        });
      });
    }
  }, [status, result, lastSubmitMeta, toast]);

  const handleSubmit = (
    file: File,
    taskName: EEGTaskId,
    modelName: EEGModelId,
    age?: number,
    sex?: string,
    label?: string,
  ) => {
    setViewingSession(null);
    setUploadedFile(file);
    setMainTab("analysis");

    const displayName = label?.trim() || file.name;
    setLastSubmitMeta({ fileName: displayName, taskName, modelName, age, sex });
    submitEEG({ eegFile: file, taskName, modelName, subjectAge: age, subjectSex: sex });

    // Start BDF parsing immediately and store the Promise — the save effect will
    // await it so EEG data is always ready regardless of relative timing
    parsedEEGPromiseRef.current = parseBDF(file, 60)
      .then((parsed) => ({
        channels:      parsed.channels,
        sfreq:         parsed.sfreq,
        originalSfreq: parsed.originalSfreq,
        duration:      parsed.duration,
      }))
      .catch(() => null);
  };

  const handleViewSession = (session: SessionRecord) => {
    setViewingSession(session);
    setUploadedFile(null);
    setMainTab("analysis");
  };

  const handleDownloadPDF = () => {
    if (!displayResult) return;
    const meta = viewingSession
      ? {
          fileName: viewingSession.file_name,
          taskName: viewingSession.task_name,
          modelName: viewingSession.model_name,
          subjectAge: viewingSession.subject_age ?? undefined,
          subjectSex: viewingSession.subject_sex ?? undefined,
        }
      : lastSubmitMeta
        ? {
            fileName: lastSubmitMeta.fileName,
            taskName: lastSubmitMeta.taskName,
            modelName: lastSubmitMeta.modelName,
            subjectAge: lastSubmitMeta.age,
            subjectSex: lastSubmitMeta.sex,
          }
        : { fileName: "EEG Report", taskName: "", modelName: "" };
    generatePDFReport(displayResult, { ...meta, date: new Date().toLocaleDateString() });
  };

  // Build InferenceResponse from a saved session
  const sessionToResult = (s: SessionRecord): InferenceResponse => ({
    trait_scores: (s.trait_scores as any) || { attention: 50, externalizing: 50, internalizing: 50, p_factor: 50 },
    raw_trait_scores: (s.raw_trait_scores as any) || { attention: 0, externalizing: 0, internalizing: 0, p_factor: 0 },
    confidence: s.confidence ?? 0,
    diagnosis: s.diagnosis || "Unknown",
    diagnosis_description: s.diagnosis_description || "",
    layman_summary: s.layman_summary || "",
    risk_level: s.risk_level || "moderate",
    explainability: s.explainability || { important_channels: [], frequency_bands: [] },
    clinical_notes: s.clinical_notes || "",
    disclaimer: "",
    eeg_preview: s.eeg_preview,
    condition_confidences: (s.condition_confidences as any) || undefined,
  });

  const displayResult = viewingSession ? sessionToResult(viewingSession) : result;

  // Whether to use the tab layout:
  // - live session with a file, OR
  // - historical session that has saved EEG channel data
  const sessionEEGData = viewingSession?.eeg_channels ?? null;
  const showTabs = uploadedFile !== null || sessionEEGData !== null;

  // EEG Viewer tab is always enabled for historical sessions (data already saved);
  // disabled for live sessions until inference completes
  const eegViewerTabDisabled = uploadedFile !== null && status !== "complete";

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 neural-grid opacity-10" />
      <div className="fixed top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-glow" />
      <div className="fixed bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse-glow animation-delay-600" />
      {orbs.map((orb, i) => (
        <div
          key={i}
          className="fixed w-1.5 h-1.5 bg-primary/20 rounded-full animate-float"
          style={{
            left: `${orb.left}%`,
            top: `${orb.top}%`,
            animationDelay: `${orb.delay}s`,
            animationDuration: `${orb.duration}s`,
          }}
        />
      ))}

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Brain className="w-6 h-6 text-primary" />
              <span className="font-semibold">Dashboard</span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors">
                <User className="w-4 h-4 text-primary" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  {user?.user_metadata?.display_name && (
                    <p className="text-sm font-semibold truncate">{user.user_metadata.display_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
          <p className="text-muted-foreground">Upload your EEG recording and get AI-powered brain analysis</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {showTabs ? (
              /* ── Tab view: Analysis + EEG Viewer ── */
              <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "analysis" | "eeg-viewer")}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="analysis" className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Analysis
                  </TabsTrigger>
                  <TabsTrigger
                    value="eeg-viewer"
                    disabled={eegViewerTabDisabled}
                    className="flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Brain className="w-4 h-4" />
                    EEG Viewer
                    {eegViewerTabDisabled && (
                      <span className="text-xs text-muted-foreground ml-1"></span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="analysis" className="space-y-8">
                  {uploadedFile ? (
                    /* Live session */
                    <>
                      <EEGUploadPanel
                        status={status}
                        progress={progress}
                        error={error}
                        onSubmit={handleSubmit}
                        onReset={reset}
                      />
                      {displayResult ? (
                        <InferenceResults result={displayResult} />
                      ) : (
                        <div className="p-6 rounded-2xl bg-card border border-border">
                          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            Your Trait Scores
                          </h2>
                          <p className="text-sm text-muted-foreground text-center py-8">
                            Running analysis… results will appear here shortly.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Historical session in tab layout */
                    <>
                      {viewingSession && (
                        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                          <div>
                            <p className="font-medium">Viewing: {viewingSession.file_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(viewingSession.created_at).toLocaleDateString()} · {viewingSession.task_name} · {viewingSession.model_name}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => { setViewingSession(null); setMainTab("analysis"); }}>
                            Back to Upload
                          </Button>
                        </div>
                      )}
                      {displayResult && <InferenceResults result={displayResult} />}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="eeg-viewer">
                  {uploadedFile ? (
                    <EEGViewer
                      file={uploadedFile}
                      onClose={() => setMainTab("analysis")}
                    />
                  ) : (
                    <EEGViewer
                      savedData={sessionEEGData}
                      onClose={() => setMainTab("analysis")}
                    />
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              /* ── No file, no saved EEG data: original layout ── */
              <>
                {/* Show upload panel when not viewing a saved session */}
                {!viewingSession && (
                  <EEGUploadPanel
                    status={status}
                    progress={progress}
                    error={error}
                    onSubmit={handleSubmit}
                    onReset={reset}
                  />
                )}

                {/* Session viewing banner */}
                {viewingSession && (
                  <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                    <div>
                      <p className="font-medium">Viewing: {viewingSession.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(viewingSession.created_at).toLocaleDateString()} · {viewingSession.task_name} · {viewingSession.model_name}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setViewingSession(null)}>
                      Back to Upload
                    </Button>
                  </div>
                )}

                {/* Results or placeholder */}
                {displayResult ? (
                  <InferenceResults result={displayResult} />
                ) : (
                  <div className="p-6 rounded-2xl bg-card border border-border">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      Your Trait Scores
                    </h2>
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Upload an EEG file to see your real trait scores, or view a past session from the sidebar.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Results Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" />
                Results
              </h3>
              {displayResult ? (
                <>
                  <div className="text-center py-2">
                    <div className="text-2xl font-bold text-primary mb-2 leading-tight">
                      {displayResult.diagnosis}
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={`text-sm font-semibold capitalize ${
                        displayResult.risk_level === "low" ? "text-neural-green"
                        : displayResult.risk_level === "moderate" ? "text-accent"
                        : displayResult.risk_level === "elevated" ? "text-trait-attention"
                        : "text-destructive"
                      }`}>
                        {displayResult.risk_level.charAt(0).toUpperCase() + displayResult.risk_level.slice(1)} Risk
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-sm font-medium">{displayResult.confidence}% confidence</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${displayResult.confidence}%` }} />
                    </div>
                  </div>
                  {displayResult.layman_summary && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {displayResult.layman_summary}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground text-center mt-4 italic">
                    * AI-assisted interpretation, not a clinical diagnosis.
                  </p>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="text-3xl font-bold text-primary mb-1">—</div>
                  <p className="text-sm text-muted-foreground">Upload an EEG file to see your results</p>
                </div>
              )}
            </div>

            {/* Session History */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Session History
              </h3>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sessions yet. Upload an EEG file to get started.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => handleViewSession(session)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors group ${
                        viewingSession?.id === session.id
                          ? "bg-primary/10 border-primary/40"
                          : "bg-secondary/50 border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {new Date(session.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <div className="flex items-center gap-1">
                          {session.eeg_channels && (
                            <span title="EEG waveform saved">
                              <Brain className="w-3 h-3 text-primary/60" />
                            </span>
                          )}
                          <Eye className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{session.file_name}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-primary">{session.diagnosis || "—"}</span>
                        <span className="text-xs text-muted-foreground">{session.confidence ?? 0}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Quick Actions
              </h3>
              <div className="space-y-2">
                <Button
                  variant="neural"
                  className="w-full justify-start"
                  onClick={handleDownloadPDF}
                  disabled={!displayResult}
                >
                  <Download className="w-4 h-4" />
                  Download PDF Report
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setShowLearnTraits(true)}
                >
                  <Info className="w-4 h-4" />
                  Learn About Traits
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <LearnTraitsModal open={showLearnTraits} onClose={() => setShowLearnTraits(false)} />
    </div>
  );
};

export default UserDashboard;
