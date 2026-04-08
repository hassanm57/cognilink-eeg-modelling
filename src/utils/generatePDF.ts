import type { InferenceResponse } from "@/services/eegInference";

export interface ReportMeta {
  fileName: string;
  taskName: string;
  modelName: string;
  subjectAge?: number;
  subjectSex?: string;
  date?: string;
}

const TRAIT_CONFIG = [
  {
    key: "attention" as const,
    label: "Attention",
    color: "#f59e0b",
    bg: "#fef3c7",
    highMeans: "More pronounced difficulties with sustained focus and concentration.",
  },
  {
    key: "externalizing" as const,
    label: "Externalizing",
    color: "#ef4444",
    bg: "#fee2e2",
    highMeans: "Stronger tendencies toward behavioral regulation challenges (impulsivity, aggression).",
  },
  {
    key: "internalizing" as const,
    label: "Internalizing",
    color: "#8b5cf6",
    bg: "#ede9fe",
    highMeans: "More prominent emotional distress turned inward (anxiety, depression-like patterns).",
  },
  {
    key: "p_factor" as const,
    label: "p-Factor",
    color: "#06b6d4",
    bg: "#cffafe",
    highMeans: "Higher general vulnerability across multiple psychopathology dimensions.",
  },
];

const RISK_COLORS: Record<string, string> = {
  low: "#16a34a",
  moderate: "#d97706",
  elevated: "#ea580c",
  high: "#dc2626",
};

function percentileLabel(p: number): string {
  if (p < 25) return "Well below average";
  if (p < 40) return "Below average";
  if (p < 60) return "Within normal limits";
  if (p < 75) return "Above average";
  if (p < 90) return "Notably elevated";
  return "Significantly elevated";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function bar(pct: number, color: string): string {
  return `
    <div style="background:#e5e7eb;border-radius:4px;height:10px;overflow:hidden;margin:6px 0 4px;">
      <div style="background:${color};width:${pct}%;height:100%;border-radius:4px;"></div>
    </div>`;
}

function importanceBar(pct: number): string {
  return `
    <div style="background:#e5e7eb;border-radius:3px;height:8px;overflow:hidden;flex:1;">
      <div style="background:linear-gradient(90deg,#4f46e5,#7c3aed);width:${pct}%;height:100%;border-radius:3px;"></div>
    </div>`;
}

function buildReportHTML(result: InferenceResponse, meta: ReportMeta): string {
  const riskColor = RISK_COLORS[result.risk_level] || "#6b7280";
  const riskLabel = result.risk_level
    ? result.risk_level.charAt(0).toUpperCase() + result.risk_level.slice(1)
    : "Unknown";

  const traitCards = TRAIT_CONFIG.map((t) => {
    const pct = Math.round(result.trait_scores[t.key]);
    const label = percentileLabel(pct);
    return `
      <div style="border:1.5px solid ${t.color}33;border-radius:12px;padding:18px;background:${t.bg}44;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-weight:600;font-size:15px;color:#1e1b4b;">${t.label}</span>
          <span style="font-size:26px;font-weight:700;color:${t.color};">${ordinal(pct)}</span>
        </div>
        ${bar(pct, t.color)}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:11px;color:#6b7280;">Percentile</span>
          <span style="font-size:11px;font-weight:600;color:${t.color};background:${t.color}22;padding:2px 8px;border-radius:999px;">${label}</span>
        </div>
        <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">
          <strong>Higher scores indicate:</strong> ${t.highMeans}
        </p>
      </div>`;
  }).join("");

  const channelRows = (result.explainability?.important_channels ?? [])
    .slice(0, 10)
    .map((ch) => {
      const pct = Math.round(ch.importance * 100);
      return `
        <tr>
          <td style="padding:6px 8px;font-family:monospace;font-weight:600;font-size:12px;color:#1e1b4b;">${ch.name}</td>
          <td style="padding:6px 8px;font-size:12px;color:#6b7280;">${ch.region}</td>
          <td style="padding:6px 8px;width:180px;">
            <div style="display:flex;align-items:center;gap:8px;">
              ${importanceBar(pct)}
              <span style="font-size:11px;color:#374151;white-space:nowrap;">${pct}%</span>
            </div>
          </td>
        </tr>`;
    }).join("");

  const bandCards = (result.explainability?.frequency_bands ?? [])
    .map((b) => `
      <div style="text-align:center;background:#f8f7ff;border:1px solid #e0e7ff;border-radius:10px;padding:12px 8px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:2px;">${b.band}</div>
        <div style="font-size:20px;font-weight:700;color:#4f46e5;">${Math.round(b.power * 100)}%</div>
        <div style="font-size:10px;color:#9ca3af;">${b.range}</div>
      </div>`
    ).join("");

  const metaRows = [
    meta.fileName && `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px;">File</td><td style="font-size:12px;font-weight:500;">${meta.fileName}</td></tr>`,
    meta.taskName && `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px;">Task</td><td style="font-size:12px;font-weight:500;">${meta.taskName}</td></tr>`,
    meta.modelName && `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px;">Model</td><td style="font-size:12px;font-weight:500;">${meta.modelName}</td></tr>`,
    meta.subjectAge && `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px;">Age</td><td style="font-size:12px;font-weight:500;">${meta.subjectAge}</td></tr>`,
    meta.subjectSex && `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px;">Sex</td><td style="font-size:12px;font-weight:500;">${meta.subjectSex.charAt(0).toUpperCase() + meta.subjectSex.slice(1)}</td></tr>`,
    meta.date && `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px;">Date</td><td style="font-size:12px;font-weight:500;">${meta.date}</td></tr>`,
  ].filter(Boolean).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CogniLink — Neurocognitive Assessment Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #ffffff;
      color: #111827;
      line-height: 1.6;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 40px 48px; }
    .section { margin-bottom: 32px; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #4f46e5;
      border-bottom: 2px solid #e0e7ff;
      padding-bottom: 6px;
      margin-bottom: 16px;
    }
    @media print {
      @page { margin: 20mm 18mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 0; max-width: 100%; }
      .no-break { break-inside: avoid; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="section no-break" style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #4f46e5;padding-bottom:20px;margin-bottom:28px;">
    <div>
      <div style="font-size:22px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px;">CogniLink</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px;">Neurocognitive Assessment Report</div>
    </div>
    <table style="text-align:right;">
      ${metaRows}
    </table>
  </div>

  <!-- DIAGNOSIS SUMMARY -->
  <div class="section no-break" style="background:linear-gradient(135deg,#f0f0ff 0%,#e8f5ff 100%);border:2px solid #c7d2fe;border-radius:16px;padding:24px 28px;">
    <div class="section-title" style="border-color:#c7d2fe;">Diagnosis Summary</div>
    <div style="font-size:26px;font-weight:800;color:#1e1b4b;margin-bottom:12px;line-height:1.2;">${result.diagnosis || "—"}</div>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <span style="background:${riskColor}22;color:${riskColor};font-weight:700;font-size:13px;padding:4px 14px;border-radius:999px;border:1.5px solid ${riskColor}44;">
        ${riskLabel} Risk
      </span>
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:160px;">
        <span style="font-size:12px;color:#6b7280;white-space:nowrap;">Confidence</span>
        <div style="background:#ddd;border-radius:4px;height:8px;flex:1;overflow:hidden;">
          <div style="background:#4f46e5;width:${result.confidence}%;height:100%;border-radius:4px;"></div>
        </div>
        <span style="font-size:13px;font-weight:700;color:#1e1b4b;white-space:nowrap;">${result.confidence}%</span>
      </div>
    </div>
    ${result.diagnosis_description ? `<p style="font-size:13px;color:#374151;margin-top:14px;line-height:1.7;">${result.diagnosis_description}</p>` : ""}
  </div>

  <!-- TRAIT SCORES -->
  <div class="section no-break">
    <div class="section-title">Predicted Trait Scores</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      ${traitCards}
    </div>
  </div>

  <!-- PLAIN LANGUAGE SUMMARY -->
  ${result.layman_summary ? `
  <div class="section no-break">
    <div class="section-title">Summary</div>
    <div style="background:#f9fafb;border-left:4px solid #4f46e5;border-radius:0 10px 10px 0;padding:16px 20px;">
      <p style="font-size:14px;color:#1f2937;line-height:1.8;">${result.layman_summary}</p>
    </div>
  </div>` : ""}

  <!-- CLINICAL NOTES -->
  ${result.clinical_notes ? `
  <div class="section no-break page-break">
    <div class="section-title">Clinical Notes</div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;">
      <p style="font-size:13px;color:#374151;line-height:1.8;">${result.clinical_notes}</p>
    </div>
  </div>` : ""}

  <!-- CHANNEL IMPORTANCE -->
  ${channelRows ? `
  <div class="section no-break">
    <div class="section-title">EEG Channel Importance - Saliency Analysis</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.05em;">CHANNEL</th>
          <th style="padding:8px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.05em;">REGION</th>
          <th style="padding:8px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.05em;">IMPORTANCE</th>
        </tr>
      </thead>
      <tbody>${channelRows}</tbody>
    </table>
  </div>` : ""}

  <!-- FREQUENCY BANDS -->
  ${bandCards ? `
  <div class="section no-break">
    <div class="section-title">Frequency Band Power</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
      ${bandCards}
    </div>
  </div>` : ""}

  <!-- DISCLAIMER -->
  <div class="section no-break" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-top:8px;">
    <div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:6px;">Research Disclaimer</div>
    <p style="font-size:11px;color:#7f1d1d;line-height:1.6;">
      ${result.disclaimer || "These outputs are AI-generated research-oriented risk indicators, not clinical diagnoses. They are intended to support — not replace — clinical evaluation by qualified healthcare professionals. The neurocognitive scores and diagnostic labels are derived from machine learning models trained on research-grade EEG data and may not reflect individual clinical presentations. Please consult a licensed clinician for medical decision-making."}
    </p>
  </div>

  <!-- FOOTER -->
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:10px;color:#9ca3af;">Generated by CogniLink Mind Weaver · AI-Assisted EEG Analysis</span>
    <span style="font-size:10px;color:#9ca3af;">${meta.date || new Date().toLocaleDateString()}</span>
  </div>

</div>
</body>
</html>`;
}

export function generatePDFReport(result: InferenceResponse, meta: ReportMeta): void {
  const html = buildReportHTML(result, meta);
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup blocked. Please allow popups for this site to generate the PDF report.");
    return;
  }
  win.document.write(html);
  win.document.close();
  // Slight delay lets the browser render before triggering print
  setTimeout(() => win.print(), 400);
}
