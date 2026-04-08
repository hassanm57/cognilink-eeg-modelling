# CogniLink: Cross-Subject EEG Modeling

**CogniLink** is a full-stack EEG psychopathology analysis platform. Users upload a BDF EEG file, receive AI-generated trait scores and a clinical diagnosis, then explore the raw waveform in an interactive browser-based EEG viewer.  

---
<img width="629" height="345" alt="image" src="https://github.com/user-attachments/assets/6cb4618b-d662-4202-b7bd-463ef3d21f6c" />

<img width="921" height="488" alt="image" src="https://github.com/user-attachments/assets/9ee7bc8a-2ccf-4da9-9ef0-0937abaeb488" />
<img width="387" height="184" alt="image" src="https://github.com/user-attachments/assets/fe25e2f2-a78d-4467-8e2c-6d573c0007c9" />



## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [BDF File Format](#bdf-file-format)
- [Full Data Flow](#full-data-flow)
- [FastAPI Backend](#fastapi-backend)
- [Inference Orchestration](#inference-orchestration)
- [AI Diagnosis](#ai-diagnosis)
- [Authentication & Roles](#authentication--roles)
- [Frontend Structure](#frontend-structure)
- [Session Persistence](#session-persistence)
- [Usage](#usage)
- [License](#license)

---

## Project Overview

**CogniLink** allows users to:

1. Upload EEG `.bdf` files.
2. Get AI-generated trait scores: **Attention**, **Externalizing**, **Internalizing**, and **p_factor**.
3. Receive a clinical diagnosis and risk assessment.
4. Explore raw EEG waveforms interactively in the browser.

---

## Tech Stack

- **Frontend:** React + TypeScript SPA (Vite, port 8080), Tailwind CSS, shadcn/ui  
- **Backend (Inference):** Python FastAPI server (uvicorn), exposed via ngrok  
- **AI Diagnosis (User):** Supabase edge function `analyze-diagnosis` → Lovable AI Gateway → Google Gemini 2.5 Flash  
- **AI Diagnosis (Doctor):** Supabase edge function `analyze-diagnosis-clinical` → same gateway with clinical prompt  
- **Database:** Supabase (PostgreSQL) — `eeg_sessions` table  

---

## BDF File Format

- **Format:** BioSemi Data Format (BDF) — binary biosignal files from BioSemi ActiveTwo EEG amplifiers  
- **Channels:** 128 EEG electrodes + 1 reference = 129 channels (10-20 montage names, plus `Status` channel)  
- **Sampling Rate:** 512 Hz or 2048 Hz  
- **Duration:** 6–20 minutes depending on task  
- **File Size:** 50–500 MB  
- **Dataset Source:** Healthy Brain Network (HBN) — pediatric/adolescent cognitive tasks  
- **Pre-filtering:** Bandpass 1–40 Hz already applied; backend does not re-filter  
- **Filename Convention:** `sub-<ID>_task-<TaskId>_run-<N>_eeg.bdf` (auto-detected by upload panel)  

---

## Full Data Flow
User selects .bdf file + task (auto-detected) + model + age + sex
│
├─► EEGUploadPanel (UI) — File held in browser memory
│ └─► detectTaskFromFilename() auto-selects EEG_TASKS entry
│
├─► useEEGInference hook (orchestration)
│ │
│ ├─► Step 1: POST /api/predict → FastAPI (Python)
│ │ Returns: trait_scores, confidence, eeg_preview, explainability
│ │
│ ├─► Step 2: POST analyze-diagnosis → Supabase edge fn → Gemini 2.5
│ │ Returns: diagnosis, risk_level, clinical_notes, layman_summary
│ │
│ └─► Step 3: saveSession() → Supabase eeg_sessions table
│
├─► InferenceResults component — renders trait scores, bell curve, explainability
│
└─► EEGViewer tab (unlocks after inference completes)
└─► parseBDF(file) — parses full EEG client-side


---

## FastAPI Backend

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /api/predict` | POST | Main inference — returns trait scores + explainability |
| `POST /api/eeg-data` | POST | Legacy server-side viewer (unused) |
| `GET /api/health` | GET | Server health check |
| `GET /api/models` | GET | Lists available model IDs and weights |

### `/api/predict` Pipeline

1. **Receive & write file:** multipart BDF upload, written to temp file for MNE  
2. **Preprocessing:** resample to 100 Hz, pad/trim channels to 129, split into 2s windows, z-score normalize  
3. **Model loading:** EEGNeX (default) or LabRaM; weights cached  
4. **Inference:** CUDA if available, outputs per-window predictions  
5. **Confidence score:** calculated from prediction consistency and sign agreement  
6. **Trait mapping:** externalizing direct model output; attention/internalizing/p_factor use heuristics + noise  
7. **Explainability:** gradients → top channels, temporal importance, frequency bands  
8. **EEG preview:** first 8 channels, 5s sample for frontend preview  
9. **CORS:** allows all origins, handles ngrok preflight  

---

## Inference Orchestration — `useEEGInference`

- Manages two-step pipeline (FastAPI → AI Diagnosis)  
- Status states: `idle` → `uploading` → `processing` → `diagnosis` → `complete`  
- Handles errors, retries, and session persistence  

---

## AI Diagnosis

- **User-facing:** Converts trait scores to a simple clinical risk and layman summary  
- **Doctor-facing:** Converts scores to clinical diagnostic notes using a specialized prompt  
- Runs through **Supabase Edge Function** → **Lovable AI Gateway** → **Google Gemini 2.5 Flash**  

---

## Authentication & Roles

- **Roles:** `user`, `doctor`, `admin`  
- **Supabase Auth:** JWT-based session management  
- **Access Control:** Users can see only their sessions; doctors can see all patients; admins manage models and users  

---

## Frontend Structure

- `EEGUploadPanel.tsx` — file selection, task detection, model selection  
- `InferenceResults.tsx` — results display, explainability charts  
- `EEGViewer.tsx` — interactive EEG waveform viewer (uses Plotly.js)  
- `hooks/useEEGInference.ts` — orchestrates upload, inference, AI diagnosis  
- `services/supabase.ts` — session persistence and auth  

---

## Session Persistence

- **Supabase Table:** `eeg_sessions`  
- Stores: `user_id`, `file_name`, `task_id`, `timestamp`, `trait_scores`, `diagnosis`, `risk_level`  
- Allows user to revisit previous sessions and download session data  

---

## Usage

```bash
# Backend
cd backend
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```
