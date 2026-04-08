import { useState, useCallback } from "react";
import { runInference, type InferenceRequest, type InferenceResponse } from "@/services/eegInference";
import { analyzeDiagnosis } from "@/services/aiDiagnosis";
import { useToast } from "@/hooks/use-toast";

export type InferenceStatus = "idle" | "uploading" | "processing" | "analyzing" | "complete" | "error";

export function useEEGInference() {
  const [status, setStatus] = useState<InferenceStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<InferenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const submitEEG = useCallback(async (request: InferenceRequest) => {
    setStatus("uploading");
    setProgress(10);
    setError(null);
    setResult(null);

    try {
      // Step 1: Upload and run EEG model inference
      setProgress(30);
      setStatus("processing");

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 3, 60));
      }, 800);

      const rawResponse = await runInference(request);
      clearInterval(progressInterval);

      console.log("[EEG Inference] Raw API response:", JSON.stringify(rawResponse, null, 2));

      // Step 2: Send trait scores to AI for diagnosis
      setProgress(65);
      setStatus("analyzing");

      const analysisInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 3, 95));
      }, 600);

      const fullResult = await analyzeDiagnosis({
        trait_scores: rawResponse.trait_scores,
        confidence: rawResponse.confidence,
        task_name: request.taskName,
        subject_age: request.subjectAge,
        subject_sex: request.subjectSex,
        eeg_preview: rawResponse.eeg_preview,
      });

      clearInterval(analysisInterval);
      setProgress(100);
      setStatus("complete");
      setResult(fullResult);

      console.log("[AI Diagnosis] Full result:", JSON.stringify(fullResult, null, 2));

      toast({
        title: "Analysis Complete",
        description: `Diagnosis: ${fullResult.diagnosis} (${fullResult.confidence}% confidence)`,
      });
    } catch (err) {
      setStatus("error");
      setProgress(0);
      const message = err instanceof Error ? err.message : "Inference failed";
      setError(message);

      toast({
        title: "Analysis Failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [toast]);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  return { status, progress, result, error, submitEEG, reset };
}
