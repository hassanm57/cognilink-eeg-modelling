from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import torch
import numpy as np
import tempfile
import os

from eegnex_model import EEGNeX
from preprocess import load_and_preprocess_bdf

app = FastAPI(title="Cognilink EEGNeX API")

# Allow CORS from the frontend (e.g. http://localhost:8080)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model
model = EEGNeX()
model.eval()

@app.post("/api/predict")
async def predict(eeg_file: UploadFile = File(...)):
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".bdf") as tmp:
        tmp.write(await eeg_file.read())
        tmp_path = tmp.name

    # Preprocess EEG
    eeg = load_and_preprocess_bdf(tmp_path)
    eeg_tensor = torch.tensor(eeg)

    # Inference
    with torch.no_grad():
        output = model(eeg_tensor)

    scores_arr = np.array(output.numpy().flatten())
    scores = scores_arr.tolist()

    os.remove(tmp_path)

    # Confidence derived from prediction spread:
    # Higher variance across the 4 trait scores → more discriminative output → higher confidence
    pred_std = float(np.std(scores_arr))
    pred_range = float(np.ptp(scores_arr))
    confidence = float(np.clip(0.35 + pred_std * 0.4 + pred_range * 0.1, 0.20, 0.92))

    return {
        "trait_scores": {
            "attention": scores[0],
            "externalizing": scores[1],
            "internalizing": scores[2],
            "p_factor": scores[3]
        },
        "confidence": confidence,
        "note": "Research only EEG based risk indicators"
    }
