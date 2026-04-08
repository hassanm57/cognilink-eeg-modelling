import { supabase } from "@/integrations/supabase/client";
import type { RawTraitScores, InferenceResponse, ConditionConfidences } from "./eegInference";

import type { EEGPreviewData, ExplainabilityData } from "./eegInference";

interface AnalyzeDiagnosisRequest {
  trait_scores: RawTraitScores;
  confidence: number;
  task_name?: string;
  subject_age?: number;
  subject_sex?: string;
  eeg_preview?: EEGPreviewData;
  explainability?: ExplainabilityData;
}

export interface ClinicalInferenceResponse extends InferenceResponse {
  differential_diagnoses: string[];
  severity: "subclinical" | "mild" | "moderate" | "severe";
  eeg_biomarkers: string[];
  recommendations: string[];
}

export async function analyzeDiagnosisClinical(
  request: AnalyzeDiagnosisRequest
): Promise<ClinicalInferenceResponse> {
  const { data, error } = await supabase.functions.invoke("analyze-diagnosis-clinical", {
    body: request,
  });

  if (error) throw new Error(`Clinical AI diagnosis failed: ${error.message}`);
  if (data.error) throw new Error(data.error);

  return {
    trait_scores: data.trait_percentiles || {
      attention: 50, externalizing: 50, internalizing: 50, p_factor: 50,
    },
    raw_trait_scores: request.trait_scores,
    confidence: data.confidence ?? request.confidence,
    diagnosis: data.diagnosis || "Undetermined",
    diagnosis_description: data.diagnosis_description || "",
    layman_summary: "",
    risk_level: data.risk_level || "moderate",
    explainability: request.explainability || data.explainability || {
      important_channels: [], frequency_bands: [],
    },
    clinical_notes: data.clinical_notes || "",
    disclaimer: data.disclaimer || "Research-oriented computational aid. Not a standalone clinical diagnosis.",
    eeg_preview: request.eeg_preview,
    condition_confidences: data.condition_confidences as ConditionConfidences | undefined,
    differential_diagnoses: data.differential_diagnoses || [],
    severity: data.severity || "subclinical",
    eeg_biomarkers: data.eeg_biomarkers || [],
    recommendations: data.recommendations || [],
  };
}

export async function analyzeDiagnosis(request: AnalyzeDiagnosisRequest): Promise<InferenceResponse> {
  const { data, error } = await supabase.functions.invoke("analyze-diagnosis", {
    body: request,
  });

  if (error) {
    throw new Error(`AI diagnosis failed: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return {
    trait_scores: data.trait_percentiles || {
      attention: 50,
      externalizing: 50,
      internalizing: 50,
      p_factor: 50,
    },
    raw_trait_scores: request.trait_scores,
    confidence: data.confidence ?? request.confidence,
    diagnosis: data.diagnosis || "Undetermined",
    diagnosis_description: data.diagnosis_description || "",
    layman_summary: data.layman_summary || "",
    risk_level: data.risk_level || "moderate",
    explainability: request.explainability || data.explainability || {
      important_channels: [],
      frequency_bands: [],
    },
    clinical_notes: data.clinical_notes || "",
    disclaimer: data.disclaimer || "These outputs are research-oriented risk indicators, not clinical diagnoses.",
    eeg_preview: request.eeg_preview,
    condition_confidences: data.condition_confidences as ConditionConfidences | undefined,
  };
}
