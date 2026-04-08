import { supabase } from "@/integrations/supabase/client";
import type { InferenceResponse } from "./eegInference";

export interface SavedEEGChannels {
  channels: { name: string; data: number[] }[];
  sfreq: number;
  originalSfreq: number;
  duration: number;
}

export interface SessionRecord {
  id: string;
  created_at: string;
  file_name: string;
  task_name: string;
  model_name: string;
  diagnosis: string | null;
  confidence: number | null;
  risk_level: string | null;
  trait_scores: Record<string, number> | null;
  raw_trait_scores: Record<string, number> | null;
  layman_summary: string | null;
  diagnosis_description: string | null;
  clinical_notes: string | null;
  explainability: any | null;
  eeg_preview: any | null;
  eeg_channels: SavedEEGChannels | null;
  subject_age: number | null;
  subject_sex: string | null;
  condition_confidences: any | null;
}

export async function saveSession(params: {
  fileName: string;
  taskName: string;
  modelName: string;
  result: InferenceResponse;
  subjectAge?: number;
  subjectSex?: string;
  eegChannels?: SavedEEGChannels | null;
}): Promise<{ error: string | null }> {
  // getSession() reads from local storage — reliable while the user is logged in.
  // getUser() makes a server round-trip which can fail and return null unexpectedly.
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  const { error } = await supabase.from("eeg_sessions" as any).insert({
    file_name: params.fileName,
    task_name: params.taskName,
    model_name: params.modelName,
    user_id: userId,
    diagnosis: params.result.diagnosis,
    confidence: params.result.confidence,
    risk_level: params.result.risk_level,
    trait_scores: params.result.trait_scores,
    raw_trait_scores: params.result.raw_trait_scores,
    layman_summary: params.result.layman_summary,
    diagnosis_description: params.result.diagnosis_description,
    clinical_notes: params.result.clinical_notes,
    explainability: params.result.explainability,
    eeg_preview: params.result.eeg_preview,
    eeg_channels: params.eegChannels ?? null,
    subject_age: params.subjectAge ?? null,
    subject_sex: params.subjectSex ?? null,
    condition_confidences: params.result.condition_confidences ?? null,
  } as any);

  if (error) {
    console.error("[Session] Failed to save:", error);
    return { error: error.message };
  }
  return { error: null };
}

export async function fetchSessions(): Promise<SessionRecord[]> {
  const { data, error } = await supabase
    .from("eeg_sessions" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[Session] Failed to fetch:", error);
    return [];
  }

  return (data as any as SessionRecord[]) || [];
}

export async function saveSessionForPatient(
  params: {
    fileName: string;
    taskName: string;
    modelName: string;
    result: InferenceResponse;
    subjectAge?: number;
    subjectSex?: string;
    eegChannels?: SavedEEGChannels | null;
  },
  patientId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("eeg_sessions" as any).insert({
    file_name: params.fileName,
    task_name: params.taskName,
    model_name: params.modelName,
    user_id: patientId,
    diagnosis: params.result.diagnosis,
    confidence: params.result.confidence,
    risk_level: params.result.risk_level,
    trait_scores: params.result.trait_scores,
    raw_trait_scores: params.result.raw_trait_scores,
    layman_summary: params.result.layman_summary,
    diagnosis_description: params.result.diagnosis_description,
    clinical_notes: params.result.clinical_notes,
    explainability: params.result.explainability,
    eeg_preview: params.result.eeg_preview,
    eeg_channels: params.eegChannels ?? null,
    subject_age: params.subjectAge ?? null,
    subject_sex: params.subjectSex ?? null,
    condition_confidences: params.result.condition_confidences ?? null,
  } as any);

  if (error) {
    console.error("[Session] Failed to save for patient:", error);
    return { error: error.message };
  }
  return { error: null };
}

export async function fetchSession(id: string): Promise<SessionRecord | null> {
  const { data, error } = await supabase
    .from("eeg_sessions" as any)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[Session] Failed to fetch session:", error);
    return null;
  }

  return data as any as SessionRecord;
}
