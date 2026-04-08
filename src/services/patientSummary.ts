import { supabase } from "@/integrations/supabase/client";

export interface PatientSummarySession {
  diagnosis: string | null;
  risk_level: string | null;
  confidence: number | null;
  created_at: string;
}

export async function generatePatientSummary(
  sessions: PatientSummarySession[]
): Promise<string | null> {
  if (sessions.length === 0) return null;
  try {
    const { data, error } = await supabase.functions.invoke("patient-summary", {
      body: { sessions },
    });
    if (error || !data || data.summary === null) return null;
    return data.summary as string;
  } catch {
    return null;
  }
}
