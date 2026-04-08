// EEG Inference API Service
// Calls the external FastAPI inference server (EEGNeX / CoFormer)
export const API_BASE_URL = "https://unnocturnally-genitival-princeton.ngrok-free.dev";

export const EEG_TASKS = [
  { id: "RestingState", label: "Resting State" },
  { id: "contrastChangeDetection", label: "Contrast Change Detection" },
  { id: "DespicableMe", label: "Movie Watching" },
  { id: "surroundSupression", label: "Surround Suppression" },
  { id: "sequenceLearning", label: "Sequence Learning" },
] as const;

export type EEGTaskId = (typeof EEG_TASKS)[number]["id"];

export const EEG_MODELS = [
  { id: "CNNEnsemble", label: "CNNEnsemble Zoo (4-trait direct)" },
  { id: "EEGNeX", label: "EEGNeX (60K params)" },
  { id: "LabRaM", label: "LabRaM (11M params)" },
  { id: "DANN", label: "DANN (8M params)" },
  { id: "CNN-Transformer", label: "CNN-Transformer (11M params)" },
] as const;

export type EEGModelId = (typeof EEG_MODELS)[number]["id"];

export interface InferenceRequest {
  eegFile: File;
  taskName: EEGTaskId;
  modelName: EEGModelId;
  subjectAge?: number;
  subjectSex?: string;
}

export interface RawTraitScores {
  attention: number;
  externalizing: number;
  internalizing: number;
  p_factor: number;
}

export interface TraitScores {
  attention: number;
  externalizing: number;
  internalizing: number;
  p_factor: number;
}

export interface ConditionConfidences {
  adhd: number;
  ocd: number;
  anxiety: number;
  depression: number;
  asd: number;
  bipolar: number;
}

export interface ExplainabilityData {
  important_channels: { name: string; importance: number; region: string }[];
  frequency_bands: { band: string; range: string; power: number }[];
}

export interface EEGPreviewChannel {
  name: string;
  data: number[];
}

export interface EEGPreviewData {
  channels: EEGPreviewChannel[];
  sfreq: number;
  duration: number;
}

// Raw response from the FastAPI backend
export interface RawInferenceResponse {
  trait_scores: RawTraitScores;
  confidence: number;
  eeg_preview?: EEGPreviewData;
  note?: string;
}

// Full analyzed response after AI diagnosis
export interface InferenceResponse {
  trait_scores: TraitScores; // normalized percentiles (0-100)
  raw_trait_scores: RawTraitScores;
  confidence: number;
  diagnosis: string;
  diagnosis_description: string;
  layman_summary: string;
  risk_level: string;
  explainability: ExplainabilityData;
  clinical_notes: string;
  disclaimer: string;
  eeg_preview?: EEGPreviewData;
  condition_confidences?: ConditionConfidences;
}

export async function runInference(request: InferenceRequest): Promise<RawInferenceResponse> {
  const formData = new FormData();
  formData.append("eeg_file", request.eegFile);
  formData.append("task_name", request.taskName);
  formData.append("model_name", request.modelName);

  if (request.subjectAge !== undefined) {
    formData.append("subject_age", String(request.subjectAge));
  }
  if (request.subjectSex) {
    formData.append("subject_sex", request.subjectSex);
  }

  const response = await fetch(`${API_BASE_URL}/api/predict`, {
    method: "POST",
    body: formData,
    headers: {
      "ngrok-skip-browser-warning": "true",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Inference failed (${response.status}): ${errorText}`);
  }

  return response.json();
}
