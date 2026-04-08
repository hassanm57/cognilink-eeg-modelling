import { supabase } from "@/integrations/supabase/client";
import type { SessionRecord } from "./sessionHistory";

export interface PatientRecord {
  user_id: string;
  display_name: string | null;
  created_at: string;
  session_count: number;
  last_session_at: string | null;
  last_diagnosis: string | null;
  last_risk_level: string | null;
}

export async function fetchAllPatients(): Promise<PatientRecord[]> {
  const { data, error } = await supabase.rpc("get_all_patients" as any);
  if (error) {
    console.error("[Patients] Failed to fetch:", error);
    return [];
  }
  return (data as any as PatientRecord[]) || [];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchPatientSessions(patientId: string): Promise<SessionRecord[]> {
  if (!UUID_REGEX.test(patientId)) {
    console.error("[Patients] Invalid patientId format:", patientId);
    return [];
  }
  const { data, error } = await supabase.rpc("get_patient_sessions" as any, {
    _patient_id: patientId,
  });
  if (error) {
    console.error("[Patients] Failed to fetch sessions:", error);
    return [];
  }
  return (data as any as SessionRecord[]) || [];
}
