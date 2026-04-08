import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Brain, Search, LogOut, ArrowLeft, Upload, Activity,
  BarChart3, Users, ChevronRight, FileText, AlertTriangle,
  CheckCircle, Clock, Loader2, Eye, Microscope, Sparkles,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { runInference } from "@/services/eegInference";
import { analyzeDiagnosisClinical, type ClinicalInferenceResponse } from "@/services/aiDiagnosis";
import { saveSessionForPatient } from "@/services/sessionHistory";
import { fetchAllPatients, fetchPatientSessions, type PatientRecord } from "@/services/patientService";
import { generatePatientSummary } from "@/services/patientSummary";
import type { SessionRecord } from "@/services/sessionHistory";
import EEGUploadPanel from "@/components/EEGUploadPanel";
import EEGViewer from "@/components/EEGViewer";
import BrainTopography from "@/components/BrainTopography";
import NormativePercentile from "@/components/NormativePercentile";
import { parseBDF } from "@/utils/parseBDF";
import type { EEGTaskId, EEGModelId, InferenceResponse } from "@/services/eegInference";

type ActiveTab = "overview" | "analysis" | "eeg" | "upload";
type InferenceStatus = "idle" | "uploading" | "processing" | "analyzing" | "complete" | "error";

// ── Trait color values (inline styles — avoids Tailwind purge issue) ──────────
const TRAIT_CSS: Record<string, string> = {
  attention:    "hsl(45, 95%, 55%)",
  externalizing:"hsl(15, 95%, 55%)",
  internalizing:"hsl(280, 80%, 60%)",
  p_factor:     "hsl(340, 85%, 55%)",
};

const TRAIT_LABELS: Record<string, string> = {
  attention:    "Attention",
  externalizing:"Externalizing",
  internalizing:"Internalizing",
  p_factor:     "p-Factor",
};

const RISK_COLORS: Record<string, string> = {
  low:      "text-neural-green bg-neural-green/10 border-neural-green/30",
  moderate: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  elevated: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  high:     "text-red-400 bg-red-400/10 border-red-400/30",
};

const SEVERITY_CSS: Record<string, string> = {
  subclinical: "hsl(160, 84%, 45%)",
  mild:        "hsl(45, 95%, 55%)",
  moderate:    "hsl(30, 95%, 55%)",
  severe:      "hsl(15, 95%, 55%)",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function RiskBadge({ risk }: { risk: string | null }) {
  const r = (risk || "moderate").toLowerCase();
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${RISK_COLORS[r] || RISK_COLORS.moderate}`}>
      {r}
    </span>
  );
}

function TraitPieChart({ scores }: { scores: { attention: number; externalizing: number; internalizing: number; p_factor: number } }) {
  const data = [
    { name: "Attention",     value: Math.round(scores.attention    ?? 50) },
    { name: "Externalizing", value: Math.round(scores.externalizing ?? 50) },
    { name: "Internalizing", value: Math.round(scores.internalizing ?? 50) },
    { name: "p-Factor",      value: Math.round(scores.p_factor     ?? 50) },
  ];
  const colors = [
    TRAIT_CSS.attention,
    TRAIT_CSS.externalizing,
    TRAIT_CSS.internalizing,
    TRAIT_CSS.p_factor,
  ];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={76}
          dataKey="value"
          paddingAngle={3}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => [`${v}th percentile`]}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "11px",
            color: "hsl(var(--card-foreground))",
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "10px", color: "hsl(215, 20%, 55%)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function sessionToResult(s: SessionRecord): InferenceResponse {
  const scores = s.trait_scores as any || {};
  return {
    trait_scores: {
      attention:    scores.attention    ?? 50,
      externalizing:scores.externalizing ?? 50,
      internalizing:scores.internalizing ?? 50,
      p_factor:     scores.p_factor     ?? 50,
    },
    raw_trait_scores: (s.raw_trait_scores as any) || {
      attention: 50, externalizing: 50, internalizing: 50, p_factor: 50,
    },
    confidence:           s.confidence ?? 0,
    diagnosis:            s.diagnosis ?? "Undetermined",
    diagnosis_description:s.diagnosis_description ?? "",
    layman_summary:       s.layman_summary ?? "",
    risk_level:           s.risk_level ?? "moderate",
    explainability:       (s.explainability as any) || { important_channels: [], frequency_bands: [] },
    clinical_notes:       s.clinical_notes ?? "",
    disclaimer:           "",
    eeg_preview:          s.eeg_preview as any,
    condition_confidences:(s.condition_confidences as any) || undefined,
  };
}

const ALL_TABS: { id: ActiveTab; label: string; Icon: any }[] = [
  { id: "overview", label: "Overview",   Icon: Users    },
  { id: "analysis", label: "Analysis",   Icon: BarChart3 },
  { id: "eeg",      label: "EEG Viewer", Icon: Activity  },
  { id: "upload",   label: "Upload EEG", Icon: Upload    },
];

const DoctorDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [patients,         setPatients]         = useState<PatientRecord[]>([]);
  const [patientsLoading,  setPatientsLoading]  = useState(true);
  const [selectedPatient,  setSelectedPatient]  = useState<PatientRecord | null>(null);
  const [patientSessions,  setPatientSessions]  = useState<SessionRecord[]>([]);
  const [sessionsLoading,  setSessionsLoading]  = useState(false);
  const [selectedSession,  setSelectedSession]  = useState<SessionRecord | null>(null);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [activeTab,        setActiveTab]        = useState<ActiveTab>("overview");

  const [patientSummary,   setPatientSummary]   = useState<string | null>(null);
  const [summaryLoading,   setSummaryLoading]   = useState(false);

  const [uploadStatus,     setUploadStatus]     = useState<InferenceStatus>("idle");
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [uploadError,      setUploadError]      = useState<string | null>(null);
  const [uploadResult,     setUploadResult]     = useState<ClinicalInferenceResponse | null>(null);
  const parsedEEGRef = useRef<Promise<any>>(Promise.resolve(null));

  useEffect(() => {
    fetchAllPatients().then((p) => {
      setPatients(p);
      setPatientsLoading(false);
    });
  }, []);

  const loadPatientSessions = useCallback(async (patient: PatientRecord) => {
    setSessionsLoading(true);
    setSelectedSession(null);
    setPatientSummary(null);
    setSummaryLoading(false);

    const sessions = await fetchPatientSessions(patient.user_id);
    setPatientSessions(sessions);
    setSessionsLoading(false);

    if (sessions.length > 0) {
      setSummaryLoading(true);
      const summary = await generatePatientSummary(
        sessions.map((s) => ({
          diagnosis:  s.diagnosis,
          risk_level: s.risk_level,
          confidence: s.confidence,
          created_at: s.created_at,
        }))
      );
      setPatientSummary(summary);
      setSummaryLoading(false);
    }
  }, []);

  const handleSelectPatient = (patient: PatientRecord) => {
    setSelectedPatient(patient);
    setActiveTab("overview");
    setUploadResult(null);
    setUploadStatus("idle");
    loadPatientSessions(patient);
  };

  const handleSelectSession = (session: SessionRecord) => {
    setSelectedSession(session);
    setActiveTab("analysis");
  };

  const handleUploadSubmit = async (
    file: File, taskName: EEGTaskId, modelName: EEGModelId,
    age?: number, sex?: string, label?: string
  ) => {
    if (!selectedPatient) return;
    setUploadResult(null);
    setUploadError(null);
    setUploadStatus("uploading");
    setUploadProgress(10);

    parsedEEGRef.current = parseBDF(file, 60).catch(() => null);

    const ticker1 = setInterval(() => setUploadProgress((p) => Math.min(p + 3, 60)), 800);
    try {
      setUploadStatus("processing");
      setUploadProgress(30);
      const raw = await runInference({ eegFile: file, taskName, modelName, subjectAge: age, subjectSex: sex });
      clearInterval(ticker1);

      setUploadStatus("analyzing");
      setUploadProgress(65);
      const ticker2 = setInterval(() => setUploadProgress((p) => Math.min(p + 3, 95)), 600);

      const clinical = await analyzeDiagnosisClinical({
        trait_scores:  raw.trait_scores,
        confidence:    raw.confidence,
        task_name:     taskName,
        subject_age:   age,
        subject_sex:   sex,
        eeg_preview:   raw.eeg_preview,
      });
      clearInterval(ticker2);

      setUploadProgress(100);
      setUploadStatus("complete");
      setUploadResult(clinical);

      const eegChannels = await parsedEEGRef.current;
      await saveSessionForPatient(
        { fileName: label || file.name, taskName, modelName, result: clinical, subjectAge: age, subjectSex: sex, eegChannels },
        selectedPatient.user_id
      );

      await loadPatientSessions(selectedPatient);
      const updated = await fetchAllPatients();
      setPatients(updated);
      toast({ title: "Analysis complete", description: `Diagnosis: ${clinical.diagnosis}` });
    } catch (err: any) {
      clearInterval(ticker1);
      const msg = err?.message || "Inference failed";
      setUploadError(msg);
      setUploadStatus("error");
      setUploadProgress(0);
      toast({ title: "Analysis failed", description: msg, variant: "destructive" });
    }
  };

  const handleUploadReset = () => {
    setUploadStatus("idle");
    setUploadProgress(0);
    setUploadError(null);
    setUploadResult(null);
  };

  const filteredPatients = patients.filter((p) =>
    (p.display_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Tabs: only "Upload EEG" visible when no session selected; all 4 after session selected
  const visibleTabs = selectedSession ? ALL_TABS : ALL_TABS.filter((t) => t.id === "upload");

  const displayResult  = selectedSession ? sessionToResult(selectedSession) : null;
  const sessionXAI     = selectedSession?.explainability as any;

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <div className="absolute inset-0 neural-grid opacity-10 pointer-events-none" />

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="relative z-10 w-72 flex-shrink-0 bg-card/80 backdrop-blur-sm border-r border-border flex flex-col">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="relative">
              <Brain className="w-6 h-6 text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
            </div>
            <span className="font-semibold tracking-tight text-sm">Clinical Dashboard</span>
          </div>
          <p className="text-[10px] text-muted-foreground ml-8">
            {user?.user_metadata?.display_name || user?.email}
          </p>
        </div>

        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients..."
              className="pl-8 h-8 text-xs bg-secondary/40 border-border/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {patientsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="p-6 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-xs text-muted-foreground">
                {searchQuery ? "No matching patients" : "No registered patients yet"}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filteredPatients.map((patient) => {
                const isSelected = selectedPatient?.user_id === patient.user_id;
                const risk = patient.last_risk_level?.toLowerCase();
                return (
                  <button
                    key={patient.user_id}
                    onClick={() => handleSelectPatient(patient)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all border-r-2 ${
                      isSelected ? "bg-primary/10 border-primary" : "border-transparent hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary mt-0.5">
                      {(patient.display_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{patient.display_name || "Unknown"}</span>
                        {risk && (
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{
                              background:
                                risk === "low"      ? "hsl(160,84%,45%)" :
                                risk === "moderate" ? "hsl(45,95%,55%)"  :
                                risk === "elevated" ? "hsl(30,95%,55%)"  :
                                "hsl(15,95%,55%)",
                            }}
                          />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {patient.session_count} session{patient.session_count !== 1 ? "s" : ""}
                        {patient.last_session_at && ` · ${formatDate(patient.last_session_at)}`}
                      </div>
                    </div>
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border space-y-1.5">
          <Link to="/">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Home
            </Button>
          </Link>
          <Button
            variant="ghost" size="sm" onClick={signOut}
            className="w-full justify-start gap-2 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main Panel ──────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {selectedPatient ? (
                <>
                  <h1 className="text-base font-semibold truncate">
                    {selectedPatient.display_name || "Unknown Patient"}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{selectedPatient.session_count} session{selectedPatient.session_count !== 1 ? "s" : ""}</span>
                    {selectedPatient.last_session_at && (
                      <span>· Last: {formatDate(selectedPatient.last_session_at)}</span>
                    )}
                    {selectedPatient.last_risk_level && (
                      <RiskBadge risk={selectedPatient.last_risk_level} />
                    )}
                  </p>

                  {/* AI Patient Summary */}
                  <div className="mt-2 flex items-start gap-2">
                    <Sparkles className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    {summaryLoading ? (
                      <span className="text-[10px] text-muted-foreground italic animate-pulse">
                        Generating patient summary…
                      </span>
                    ) : patientSummary ? (
                      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
                        {patientSummary}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <h1 className="text-base font-semibold text-muted-foreground">Select a patient to begin</h1>
              )}
            </div>

            {/* Tab nav — shown only when patient is selected */}
            {selectedPatient && (
              <nav className="flex gap-1 bg-secondary/40 border border-border/40 p-1 rounded-xl flex-shrink-0">
                {visibleTabs.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeTab === id
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!selectedPatient ? (
            /* ── No patient selected ────────────────────────── */
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-primary opacity-60" />
              </div>
              <h2 className="text-lg font-semibold mb-2">No Patient Selected</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Select a patient from the sidebar to view their records, run analysis, or upload a new EEG.
              </p>
            </div>
          ) : activeTab === "upload" ? (
            /* ── Upload EEG ─────────────────────────────────── */
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-xs">
                  Uploading for:{" "}
                  <span className="font-semibold text-primary">{selectedPatient.display_name || "Unknown Patient"}</span>
                  {" "}— session will be saved to their record.
                </p>
              </div>

              <EEGUploadPanel
                status={uploadStatus as any}
                progress={uploadProgress}
                error={uploadError}
                onSubmit={handleUploadSubmit}
                onReset={handleUploadReset}
              />

              {uploadResult && (
                <div className="space-y-5 border-t border-border pt-6">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Microscope className="w-4 h-4 text-primary" />
                    Clinical Analysis Results
                  </h3>

                  <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                    <div>
                      <p className="text-base font-bold">{uploadResult.diagnosis}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <RiskBadge risk={uploadResult.risk_level} />
                        <span
                          className="text-xs font-semibold capitalize"
                          style={{ color: SEVERITY_CSS[uploadResult.severity] || "inherit" }}
                        >
                          {uploadResult.severity}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{uploadResult.confidence}% confidence</span>
                      </div>
                    </div>
                    {uploadResult.diagnosis_description && (
                      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                        {uploadResult.diagnosis_description}
                      </p>
                    )}
                  </div>

                  {uploadResult.differential_diagnoses?.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Differential Diagnoses</h4>
                      <ul className="space-y-1.5">
                        {uploadResult.differential_diagnoses.map((d, i) => (
                          <li key={i} className="flex gap-2 text-xs p-2 rounded-lg bg-secondary/30 border border-border/40">
                            <span className="text-muted-foreground font-mono flex-shrink-0">{i + 1}.</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {uploadResult.eeg_biomarkers?.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">EEG Biomarkers</h4>
                      <div className="flex flex-wrap gap-2">
                        {uploadResult.eeg_biomarkers.map((b, i) => (
                          <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">{b}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadResult.clinical_notes && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Clinical Notes</h4>
                      <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs leading-relaxed">
                        {uploadResult.clinical_notes}
                      </div>
                    </div>
                  )}

                  {uploadResult.recommendations?.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Clinical Recommendations</h4>
                      <ol className="space-y-1.5">
                        {uploadResult.recommendations.map((r, i) => (
                          <li key={i} className="flex gap-2 text-xs p-2 rounded-lg bg-neural-green/5 border border-neural-green/20">
                            <span className="font-mono font-semibold flex-shrink-0" style={{ color: "hsl(160,84%,45%)" }}>{i + 1}.</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Condition confidence predictions for upload result */}
                  {uploadResult.condition_confidences && (() => {
                    const CC_LIST = [
                      { id: "adhd", abbr: "ADHD", full: "Attention Deficit Hyperactivity Disorder" },
                      { id: "ocd", abbr: "OCD", full: "Obsessive-Compulsive Disorder" },
                      { id: "anxiety", abbr: "Anxiety", full: "Generalized Anxiety Disorder" },
                      { id: "depression", abbr: "Depression", full: "Major Depressive Disorder" },
                      { id: "asd", abbr: "ASD", full: "Autism Spectrum Disorder" },
                      { id: "bipolar", abbr: "Bipolar", full: "Bipolar Disorder" },
                    ];
                    const getColor = (pct: number) =>
                      pct < 30 ? "hsl(142,71%,45%)"
                      : pct < 50 ? "hsl(45,95%,55%)"
                      : pct < 70 ? "hsl(25,95%,55%)"
                      : "hsl(0,84%,60%)";
                    const cc = uploadResult.condition_confidences as any;
                    return (
                      <div>
                        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Condition Confidence Predictions</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {CC_LIST.map(({ id, abbr, full }) => {
                            const pct = Math.round(cc[id] ?? 0);
                            const color = getColor(pct);
                            return (
                              <div key={id} className="p-2.5 rounded-xl bg-card border border-border">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold">{abbr}</span>
                                  <span className="text-sm font-bold font-mono" style={{ color }}>{pct}%</span>
                                </div>
                                <div className="h-1 rounded-full bg-muted overflow-hidden mb-1">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-tight">{full}</p>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1.5 italic">* AI-assisted predictions — confirm clinically</p>
                      </div>
                    );
                  })()}

                  {/* Trait score grid for upload result */}
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(uploadResult.trait_scores).map(([key, val]) => {
                      const css = TRAIT_CSS[key] || "hsl(187,92%,55%)";
                      return (
                        <div key={key} className="p-3 rounded-xl bg-card border border-border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium">{TRAIT_LABELS[key] || key}</span>
                            <span className="font-mono font-bold text-sm" style={{ color: css }}>{Math.round(val)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${val}%`, background: css }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : selectedSession && activeTab === "analysis" ? (
            /* ── Analysis ────────────────────────────────────── */
            <div className="p-6">
              <div className="space-y-6">
                {/* Metadata strip */}
                <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 text-[10px] text-muted-foreground">
                  {[
                    ["File",  selectedSession.file_name],
                    ["Date",  formatDate(selectedSession.created_at)],
                    ["Task",  selectedSession.task_name],
                    ["Model", selectedSession.model_name],
                    selectedSession.subject_age ? ["Age", `${selectedSession.subject_age}y`] : null,
                    selectedSession.subject_sex ? ["Sex", selectedSession.subject_sex] : null,
                  ].filter(Boolean).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className="font-semibold uppercase tracking-widest">{k}</span>
                      <span className="text-foreground">{v}</span>
                    </span>
                  ))}
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Trait scores + pie chart */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Trait Percentiles</h3>
                    {displayResult && Object.entries(displayResult.trait_scores).map(([key, val]) => {
                      const css = TRAIT_CSS[key] || "hsl(187,92%,55%)";
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{TRAIT_LABELS[key] || key}</span>
                            <span className="text-sm font-bold font-mono" style={{ color: css }}>{Math.round(val)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.round(val)}%`, background: css }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{Math.round(val)}th percentile</div>
                        </div>
                      );
                    })}

                    {/* Pie chart below bars */}
                    {displayResult && (
                      <div className="pt-2">
                        <TraitPieChart scores={displayResult.trait_scores} />
                      </div>
                    )}
                  </div>

                  {/* Clinical assessment */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Clinical Assessment</h3>
                    <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                      <div>
                        <p className="text-base font-bold leading-snug">{selectedSession.diagnosis || "—"}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <RiskBadge risk={selectedSession.risk_level} />
                          <span className="text-xs text-muted-foreground font-mono">
                            {selectedSession.confidence != null ? `${selectedSession.confidence}% confidence` : ""}
                          </span>
                        </div>
                      </div>
                      {selectedSession.diagnosis_description && (
                        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                          {selectedSession.diagnosis_description}
                        </p>
                      )}
                    </div>

                    {selectedSession.clinical_notes && (
                      <div>
                        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Clinical Notes</h4>
                        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs leading-relaxed">
                          {selectedSession.clinical_notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {displayResult?.condition_confidences && (() => {
                  const CONDITIONS = [
                    { id: "adhd"       as const, abbr: "ADHD",       full: "Attention Deficit Hyperactivity Disorder" },
                    { id: "ocd"        as const, abbr: "OCD",        full: "Obsessive-Compulsive Disorder" },
                    { id: "anxiety"    as const, abbr: "Anxiety",    full: "Generalized Anxiety Disorder" },
                    { id: "depression" as const, abbr: "Depression", full: "Major Depressive Disorder" },
                    { id: "asd"        as const, abbr: "ASD",        full: "Autism Spectrum Disorder" },
                    { id: "bipolar"    as const, abbr: "Bipolar",    full: "Bipolar Disorder" },
                  ];
                  const getColor = (pct: number) =>
                    pct < 30 ? "hsl(142,71%,45%)"
                    : pct < 50 ? "hsl(45,95%,55%)"
                    : pct < 70 ? "hsl(25,95%,55%)"
                    : "hsl(0,84%,60%)";
                  const cc = displayResult.condition_confidences!;
                  return (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Condition Confidence Predictions</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {CONDITIONS.map(({ id, abbr, full }) => {
                          const pct = Math.round((cc as any)[id] ?? 0);
                          const color = getColor(pct);
                          return (
                            <div key={id} className="p-3 rounded-xl bg-card border border-border">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold">{abbr}</span>
                                <span className="text-sm font-bold font-mono" style={{ color }}>{pct}%</span>
                              </div>
                              <div className="h-1 rounded-full bg-muted overflow-hidden mb-1">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                              <p className="text-[9px] text-muted-foreground leading-tight">{full}</p>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-2 italic">* AI-assisted predictions — confirm clinically</p>
                    </div>
                  );
                })()}

                {displayResult && (
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Normative Distribution</h3>
                    <NormativePercentile trait_scores={displayResult.trait_scores} />
                  </div>
                )}

                {displayResult?.explainability?.important_channels?.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Channel Importance Map</h3>
                    <BrainTopography explainability={displayResult.explainability} traitScores={displayResult.trait_scores} />
                  </div>
                )}

                {sessionXAI?.important_channels?.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Top Channel Contributions</h3>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30">
                            {["Rank", "Channel", "Region", "Importance"].map((h) => (
                              <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sessionXAI.important_channels.slice(0, 10).map((ch: any, i: number) => (
                            <tr key={ch.name} className="border-b border-border/50">
                              <td className="px-4 py-2 text-muted-foreground font-mono">{i + 1}</td>
                              <td className="px-4 py-2 font-semibold font-mono">{ch.name}</td>
                              <td className="px-4 py-2 text-muted-foreground">{ch.region}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${(ch.importance || 0) * 100}%` }} />
                                  </div>
                                  <span className="font-mono text-[10px] w-8 text-right">{((ch.importance || 0) * 100).toFixed(0)}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {sessionXAI?.frequency_bands?.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Frequency Band Power</h3>
                    <div className="grid grid-cols-5 gap-3">
                      {sessionXAI.frequency_bands.map((band: any) => (
                        <div key={band.band} className="p-3 rounded-xl bg-card border border-border text-center">
                          <p className="text-xs font-semibold mb-1">{band.band}</p>
                          <p className="text-[10px] text-muted-foreground mb-2">{band.range}</p>
                          <p className="text-lg font-bold font-mono text-primary">{((band.power || 0) * 100).toFixed(0)}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground border border-border/40 rounded-lg p-3 bg-secondary/10">
                  ⚠ This EEG-derived analysis is a computational aid for clinical decision-making, not a standalone diagnosis. All findings must be interpreted within the full clinical context by a qualified healthcare professional.
                </p>
              </div>
            </div>
          ) : selectedSession && activeTab === "eeg" ? (
            /* ── EEG Viewer ──────────────────────────────────── */
            <div className="p-6">
              {selectedSession.eeg_channels ? (
                <EEGViewer savedData={selectedSession.eeg_channels as any} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Activity className="w-10 h-10 text-muted-foreground opacity-30 mb-3" />
                  <p className="text-sm font-medium mb-1">No waveform data for this session</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    EEG channel data is only saved for sessions recorded after the EEG Viewer was introduced. Upload a new recording to capture full waveform data.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* ── Overview (default when patient selected / no session) ── */
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Total Sessions",   value: String(selectedPatient.session_count), Icon: FileText    },
                  { label: "Latest Diagnosis", value: selectedPatient.last_diagnosis || "—", Icon: Microscope, truncate: true },
                  { label: "Risk Level",       value: selectedPatient.last_risk_level,        Icon: AlertTriangle, isRisk: true },
                  { label: "Last Session",     value: selectedPatient.last_session_at ? formatDate(selectedPatient.last_session_at) : "No sessions", Icon: Clock },
                ].map(({ label, value, Icon, truncate, isRisk }) => (
                  <div key={label} className="p-4 rounded-xl bg-card border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
                    </div>
                    {isRisk ? <RiskBadge risk={value ?? null} /> : (
                      <p className={`text-sm font-semibold ${truncate ? "truncate" : ""}`}>{value}</p>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Session History
                </h2>

                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : patientSessions.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-border rounded-xl">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                    <p className="text-sm text-muted-foreground">No sessions recorded for this patient.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab("upload")}>
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      Upload First EEG
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30">
                          {["Date", "Task", "Model", "Diagnosis", "Risk", "Confidence", ""].map((h) => (
                            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {patientSessions.map((s, i) => (
                          <tr key={s.id} className={`border-b border-border/50 transition-colors hover:bg-secondary/20 ${
                            selectedSession?.id === s.id ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-secondary/10"
                          }`}>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(s.created_at)}</td>
                            <td className="px-4 py-2.5 truncate max-w-[100px]">{s.task_name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{s.model_name}</td>
                            <td className="px-4 py-2.5 truncate max-w-[140px] font-medium">{s.diagnosis || "—"}</td>
                            <td className="px-4 py-2.5"><RiskBadge risk={s.risk_level} /></td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{s.confidence != null ? `${s.confidence}%` : "—"}</td>
                            <td className="px-4 py-2.5">
                              <Button
                                variant="ghost" size="sm"
                                className="h-6 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10"
                                onClick={() => handleSelectSession(s)}
                              >
                                <Eye className="w-3 h-3" />
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default DoctorDashboard;
