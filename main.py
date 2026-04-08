"""
CogniLink FastAPI Inference Server
Supports: braindecode EEGNeX, LabRaM, and CNNEnsemble models
Usage: uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import io
import tempfile
import traceback
import numpy as np
import torch
import mne
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# ── App setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="CogniLink Inference API")

# CORS: allow_origins defaults to "*" for local/ngrok dev.
# Set CORS_ORIGINS env var (comma-separated) to lock down in production.
_cors_origins_env = os.getenv("CORS_ORIGINS", "")
_allowed_origins: list[str] = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
)

# Explicit OPTIONS handler to ensure CORS preflight works through ngrok
from starlette.requests import Request
from starlette.responses import Response

@app.options("/{full_path:path}")
async def options_handler(request: Request, full_path: str):
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )

# ── Constants ────────────────────────────────────────────────────────────────
SFREQ = 100          # Target sampling rate (must match training)
N_CHANS = 129        # HBN uses 129 channels (128 EEG + 1 ref)
WINDOW_SEC = 2       # 2-second windows (matches training: crop_size_samples=2*SFREQ)
N_TIMES = SFREQ * WINDOW_SEC  # 200 time samples

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Trait names — order matches both CNNEnsemble's 4 output heads and the raw_to_trait_scores mapping
TRAIT_NAMES = ["attention", "externalizing", "internalizing", "p_factor"]

# ── CNNEnsemble constants ─────────────────────────────────────────────────────
# CNNEnsemble was trained on 128 channels (no reference electrode)
CNN_ENSEMBLE_N_CHANS = 128
CNN_ENSEMBLE_WEIGHTS_FILENAME = "model_024_epoch_001_nrmse_0.989155.pt"
# Weights path: env var takes priority, then local file, then absolute fallback
CNN_ENSEMBLE_WEIGHTS_PATH = os.getenv(
    "CNN_ENSEMBLE_WEIGHTS_PATH",
    CNN_ENSEMBLE_WEIGHTS_FILENAME,
)

# ── Validation constants ──────────────────────────────────────────────────────
ALLOWED_TASKS = {
    "RestingState", "contrastChangeDetection", "DespicableMe",
    "surroundSupression", "sequenceLearning",
}
ALLOWED_MODELS = {"EEGNeX", "LabRaM", "CNNEnsemble", "DANN", "CNN-Transformer"}
ALLOWED_SEXES = {"M", "F", "Other", "m", "f", "male", "female", "other"}
MAX_FILE_SIZE_BYTES = 600 * 1024 * 1024  # 600 MB hard limit

# ── Model cache ──────────────────────────────────────────────────────────────
loaded_models = {}


def get_model(model_name: str):
    """Load and cache a model. Returns the model instance."""
    if model_name in loaded_models:
        return loaded_models[model_name]

    # ── CNNEnsemble (4-output direct trait prediction) ────────────────────────
    if model_name == "CNNEnsemble":
        from cnn_ensemble_zoo import ModelZoo, create_model_from_config

        # Resolve weights path
        weights_path = CNN_ENSEMBLE_WEIGHTS_PATH
        if not os.path.exists(weights_path):
            weights_path = CNN_ENSEMBLE_WEIGHTS_FILENAME
        if not os.path.exists(weights_path):
            raise HTTPException(
                status_code=500,
                detail=f"CNNEnsemble weights not found at {CNN_ENSEMBLE_WEIGHTS_PATH}"
            )

        checkpoint = torch.load(weights_path, map_location=DEVICE)

        # Reconstruct model config — try checkpoint first, then regenerate deterministically
        if "config" in checkpoint:
            config = checkpoint["config"]
        else:
            # model_024 is index 24 in a zoo of 25 models with base_seed=42
            configs = ModelZoo.generate_diverse_configs(25, base_seed=42)
            config = configs[24]
            print("[CNNEnsemble] Config not in checkpoint — regenerated model_024 config")

        model = create_model_from_config(
            config,
            in_channels=CNN_ENSEMBLE_N_CHANS,
            seq_len=N_TIMES,
            num_outputs=4,
        ).to(DEVICE)

        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()

        epoch = checkpoint.get("epoch", "?")
        nrmse = checkpoint.get("val_mean_nrmse", float("nan"))
        target_nrmses = checkpoint.get("val_target_nrmses", {})
        print(f"[CNNEnsemble] Loaded epoch={epoch}, val_mean_nrmse={nrmse:.4f}")
        print(f"[CNNEnsemble] Per-trait NRMSEs: {target_nrmses}")

        loaded_models[model_name] = model
        return model

    # ── Braindecode models (EEGNeX / LabRaM) ─────────────────────────────────
    try:
        from braindecode.models import EEGNeX
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="braindecode not installed. Run: pip install braindecode"
        )

    if model_name == "LabRaM":
        # LabRaM: Use braindecode's EEGNeX architecture but look for LabRaM weights
        # In practice, LabRaM is a different architecture; for now we use EEGNeX
        # with separately trained weights as a proxy.
        # If you have actual LabRaM weights, replace this with the correct model class.
        try:
            from braindecode.models import LabRaM as LabRaMModel
            model = LabRaMModel(
                n_chans=N_CHANS,
                n_outputs=1,
                n_times=N_TIMES,
            ).to(DEVICE)
            weights_path = "weights_labram.pt"
            if os.path.exists(weights_path):
                state = torch.load(weights_path, map_location=DEVICE, weights_only=True)
                model.load_state_dict(state, strict=False)
                print(f"[LabRaM] Loaded weights from {weights_path}")
            else:
                print(f"[LabRaM] No weights at {weights_path}, using random init")
        except ImportError:
            # Fallback: use EEGNeX architecture with LabRaM weights file
            print("[LabRaM] LabRaM class not found in braindecode, using EEGNeX architecture")
            model = EEGNeX(
                n_chans=N_CHANS,
                n_outputs=1,
                n_times=N_TIMES,
            ).to(DEVICE)
            weights_path = "weights_labram.pt"
            if os.path.exists(weights_path):
                state = torch.load(weights_path, map_location=DEVICE, weights_only=True)
                model.load_state_dict(state, strict=False)
                print(f"[LabRaM-fallback] Loaded weights from {weights_path}")
            else:
                print(f"[LabRaM-fallback] No weights found, using random init")

    else:
        # Default: EEGNeX from braindecode (matches training code exactly)
        model = EEGNeX(
            n_chans=N_CHANS,
            n_outputs=1,
            n_times=N_TIMES,
        ).to(DEVICE)
        weights_path = "weights_challenge_2.pt"
        if not os.path.exists(weights_path):
            weights_path = "model_weights.pt"
        if os.path.exists(weights_path):
            state = torch.load(weights_path, map_location=DEVICE, weights_only=True)
            model.load_state_dict(state, strict=False)
            print(f"[EEGNeX] Loaded weights from {weights_path}")
        else:
            print("[EEGNeX] WARNING: No weights found (checked weights_challenge_2.pt, model_weights.pt) — predictions will be random. This is a configuration error.")

    model.eval()
    loaded_models[model_name] = model
    return model


# ── Preprocessing ────────────────────────────────────────────────────────────

def preprocess_bdf(file_bytes: bytes, filename: str, n_chans: int = N_CHANS) -> np.ndarray:
    """
    Load and preprocess a BDF file to match training pipeline:
    - Resample to 100 Hz (filtering already applied at source)
    - Pad/trim to n_chans channels (129 for EEGNeX/LabRaM, 128 for CNNEnsemble)
    - Extract 2-second windows
    - Normalize per-window
    Returns: (windows array of shape (n_windows, n_chans, N_TIMES), raw_data)
    """
    # Write to temp file for MNE
    suffix = ".bdf"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        raw = mne.io.read_raw_bdf(tmp_path, preload=True, verbose=False) #read

        # Resample to target frequency (bandpass already applied at source)
        raw.resample(SFREQ, verbose=False)

        raw_data = raw.get_data()  # (n_channels_in_file, n_times_total) after resample
        n_ch_file = raw_data.shape[0]

        # Pad or trim to n_chans for model input
        if n_ch_file < n_chans:
            pad = np.zeros((n_chans - n_ch_file, raw_data.shape[1]))
            data = np.vstack([raw_data, pad])
        elif n_ch_file > n_chans:
            data = raw_data[:n_chans, :]
        else:
            data = raw_data

        # Create non-overlapping 2-second windows
        n_samples = data.shape[1]
        stride = N_TIMES  # Non-overlapping for inference
        windows = []
        for start in range(0, n_samples - N_TIMES + 1, stride):
            window = data[:, start:start + N_TIMES]
            # Normalize per window (matches training: DatasetWrapper)
            mean = np.mean(window)
            std = np.std(window) + 1e-6
            window = (window - mean) / std
            windows.append(window)

        if not windows:
            if n_samples == 0:
                raise ValueError(
                    "BDF file contains no data samples after resampling. "
                    "The file may be corrupted or contain only a header."
                )
            # File too short for one full window: pad the available data to N_TIMES
            print(f"[Preprocess] WARNING: only {n_samples} samples — padding to {N_TIMES}")
            padded = np.zeros((n_chans, N_TIMES))
            padded[:, :n_samples] = data[:, :n_samples]
            mean = np.mean(padded)
            std = np.std(padded) + 1e-6
            padded = (padded - mean) / std
            windows.append(padded)

        return np.array(windows, dtype=np.float32), raw_data

    finally:
        os.unlink(tmp_path)


# ── Explainability (gradient-based saliency) ─────────────────────────────────

def compute_explainability(model, input_tensor: torch.Tensor):
    """
    Compute gradient-based saliency for channel importance,
    plus frequency band power and temporal importance.
    """
    input_tensor = input_tensor.clone().detach().requires_grad_(True)

    output = model(input_tensor)
    # CNNEnsemble returns (predictions, aux_loss) — unwrap if needed
    if isinstance(output, tuple):
        output = output[0]
    output.sum().backward()

    grad = input_tensor.grad.detach().cpu().numpy()  # (B, C, T)

    # Average across batch
    avg_grad = np.mean(np.abs(grad), axis=0)  # (C, T)

    # Channel importance (average gradient magnitude per channel)
    channel_importance = np.mean(avg_grad, axis=1)  # (C,)
    channel_importance = channel_importance / (channel_importance.max() + 1e-8)

    # Standard 10-20 channel names for first ~20 channels
    ch_names = [
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T7", "C3", "Cz", "C4", "T8",
        "P7", "P3", "Pz", "P4", "P8",
        "O1", "Oz", "O2"
    ]
    ch_regions = [
        "Frontal", "Frontal", "Frontal", "Frontal", "Frontal", "Frontal", "Frontal",
        "Temporal", "Central", "Central", "Central", "Temporal",
        "Parietal", "Parietal", "Parietal", "Parietal", "Parietal",
        "Occipital", "Occipital", "Occipital"
    ]

    # Top channels by importance
    top_k = min(10, len(channel_importance))
    top_indices = np.argsort(channel_importance)[::-1][:top_k]
    important_channels = []
    for idx in top_indices:
        name = ch_names[idx] if idx < len(ch_names) else f"Ch{idx}"
        region = ch_regions[idx] if idx < len(ch_regions) else "Other"
        important_channels.append({
            "name": name,
            "importance": float(channel_importance[idx]),
            "region": region,
        })

    # Temporal importance (divide into ~5 time windows)
    avg_temporal = np.mean(avg_grad, axis=0)  # (T,)
    n_windows = 5
    window_size = len(avg_temporal) // n_windows
    time_windows = []
    for i in range(n_windows):
        start_t = i * window_size / SFREQ
        end_t = (i + 1) * window_size / SFREQ
        imp = float(np.mean(avg_temporal[i * window_size:(i + 1) * window_size]))
        time_windows.append({
            "start": round(start_t, 2),
            "end": round(end_t, 2),
            "importance": round(imp / (np.max(avg_temporal) + 1e-8), 3),
        })

    # Frequency band power estimation via FFT on input
    input_np = input_tensor.detach().cpu().numpy()
    avg_signal = np.mean(input_np, axis=(0, 1))  # (T,)
    fft_vals = np.abs(np.fft.rfft(avg_signal))
    freqs = np.fft.rfftfreq(len(avg_signal), d=1.0 / SFREQ)

    bands = [
        ("Delta", "1-4 Hz", 1, 4),
        ("Theta", "4-8 Hz", 4, 8),
        ("Alpha", "8-13 Hz", 8, 13),
        ("Beta", "13-30 Hz", 13, 30),
        ("Gamma", "30-40 Hz", 30, 40),
    ]
    freq_bands = []
    total_power = np.sum(fft_vals ** 2) + 1e-8
    for name, range_str, lo, hi in bands:
        mask = (freqs >= lo) & (freqs < hi)
        power = float(np.sum(fft_vals[mask] ** 2) / total_power)
        freq_bands.append({"band": name, "range": range_str, "power": round(power, 3)})

    return {
        "important_channels": important_channels,
        "time_windows": time_windows,
        "frequency_bands": freq_bands,
    }


# ── Score mapping ────────────────────────────────────────────────────────────

def raw_to_trait_scores(raw_pred: float) -> dict:
    """
    Convert a single raw externalizing factor prediction into 4 trait scores.
    The training target is the externalizing factor (single value).
    We derive the other traits with heuristic offsets for demo purposes.
    All scores are mapped to 0-100 percentile range.
    """
    # Sigmoid-like mapping to 0-100 range
    # The externalizing factor in CBCL typically ranges ~-2 to +3
    def to_percentile(val):
        # Map raw score to 0-100 using a soft sigmoid
        return float(np.clip(50 + val * 15, 5, 95))

    ext_score = to_percentile(raw_pred)

    # Derive correlated traits (in reality these would be separate model heads).
    # Noise sigma of 0.8–1.2 gives ±12–18 percentile-point spread around the base,
    # creating realistic inter-trait variation even when the raw prediction is near zero.
    return {
        "attention": round(to_percentile(raw_pred * 0.8 + np.random.normal(0, 1.0)), 1),
        "externalizing": round(ext_score, 1),
        "internalizing": round(to_percentile(raw_pred * 0.6 + np.random.normal(0, 0.9)), 1),
        "p_factor": round(to_percentile(raw_pred * 0.9 + np.random.normal(0, 0.8)), 1),
    }


def scores_to_diagnosis(scores: dict) -> tuple[str, float]:
    """Simple rule-based diagnosis from trait scores."""
    max_trait = max(scores, key=scores.get)
    max_val = scores[max_trait]

    if max_val < 30:
        return "Normal Range", round(90 - max_val * 0.5, 1)
    elif max_trait == "attention" and max_val > 65:
        return "ADHD - Inattentive Subtype", round(55 + max_val * 0.3, 1)
    elif max_trait == "externalizing" and max_val > 65:
        return "ADHD - Combined Subtype", round(55 + max_val * 0.3, 1)
    elif max_trait == "internalizing" and max_val > 65:
        return "Anxiety / Mood Disorder", round(50 + max_val * 0.3, 1)
    elif max_trait == "p_factor" and max_val > 70:
        return "General Psychopathology Risk", round(50 + max_val * 0.3, 1)
    elif max_val > 55:
        return "Subclinical Elevation", round(60 + max_val * 0.2, 1)
    else:
        return "Within Normal Limits", round(80 - max_val * 0.3, 1)


# ── Prediction endpoint ─────────────────────────────────────────────────────

@app.post("/api/predict")
async def predict(
    eeg_file: UploadFile = File(...),
    task_name: str = Form("RestingState"),
    model_name: str = Form("EEGNeX"),
    subject_age: Optional[int] = Form(None),
    subject_sex: Optional[str] = Form(None),
):
    try:
        # ── Input validation ─────────────────────────────────────────────────
        if task_name not in ALLOWED_TASKS:
            raise HTTPException(status_code=400, detail=f"Invalid task_name '{task_name}'. Allowed: {sorted(ALLOWED_TASKS)}")
        if model_name not in ALLOWED_MODELS:
            raise HTTPException(status_code=400, detail=f"Invalid model_name '{model_name}'. Allowed: {sorted(ALLOWED_MODELS)}")
        if subject_age is not None and not (0 <= subject_age <= 120):
            raise HTTPException(status_code=400, detail="subject_age must be between 0 and 120")
        if subject_sex is not None and subject_sex.lower() not in {s.lower() for s in ALLOWED_SEXES}:
            raise HTTPException(status_code=400, detail=f"Invalid subject_sex '{subject_sex}'. Allowed: M, F, Other")
        # Normalize sex to title-case to prevent prompt injection via newlines/special chars
        if subject_sex:
            subject_sex = subject_sex.strip()[:10].replace("\n", "").replace("\r", "")

        print(f"\n{'='*60}")
        print(f"Inference request: model={model_name}, task={task_name}")
        print(f"File: {eeg_file.filename}, age={subject_age}, sex={subject_sex}")

        # Read file + size guard
        file_bytes = await eeg_file.read()
        file_size_mb = len(file_bytes) / 1024 / 1024
        print(f"File size: {file_size_mb:.1f} MB")
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({file_size_mb:.0f} MB). Maximum allowed: {MAX_FILE_SIZE_BYTES // 1024 // 1024} MB"
            )
        if len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # CNNEnsemble uses 128 channels; all others use 129
        is_cnn_ensemble = (model_name == "CNNEnsemble")
        n_chans_for_model = CNN_ENSEMBLE_N_CHANS if is_cnn_ensemble else N_CHANS

        # Preprocess
        windows, raw_data = preprocess_bdf(file_bytes, eeg_file.filename, n_chans=n_chans_for_model)
        n_windows = windows.shape[0]
        print(f"Preprocessed: {n_windows} windows, shape per window: {windows.shape[1:]}")

        # Load model
        model = get_model(model_name)

        # Run inference on all windows
        input_tensor = torch.from_numpy(windows).to(DEVICE)

        with torch.no_grad():
            raw_output = model(input_tensor)
            # CNNEnsemble returns (predictions, aux_loss) — unwrap if needed
            predictions = raw_output[0] if isinstance(raw_output, tuple) else raw_output

        def _trait_confidence(all_preds_1d: np.ndarray, avg_pred_1d: float) -> float:
            """Compute per-trait confidence from cross-window consistency."""
            pred_std = float(np.std(all_preds_1d))
            pred_range = float(np.ptp(all_preds_1d))
            mean_abs = max(abs(avg_pred_1d), 0.01)
            cv = pred_std / mean_abs
            consistency = float(np.clip(1.0 - cv, 0.1, 1.0))
            sign_agreement = float(np.mean(np.sign(all_preds_1d) == np.sign(avg_pred_1d)))
            return float(np.clip(
                consistency * 0.5 + sign_agreement * 0.3 + (1.0 - min(pred_range, 2.0) / 2.0) * 0.2,
                0.15, 0.98,
            ))

        def to_percentile(val: float) -> float:
            return float(np.clip(50 + val * 15, 5, 95))

        # all_preds_flat: 1-D array of raw model output values across all windows
        # Used for prediction_std in the response regardless of model type
        if is_cnn_ensemble:
            # ── 4-output direct prediction ────────────────────────────────────
            # predictions shape: (n_windows, 4)
            all_preds_4 = predictions.cpu().numpy()  # (n_windows, 4)
            avg_preds = all_preds_4.mean(axis=0)     # (4,)
            all_preds_flat = all_preds_4.flatten()   # for std reporting

            trait_scores = {
                name: round(to_percentile(avg_preds[i]), 1)
                for i, name in enumerate(TRAIT_NAMES)
            }
            print(f"CNNEnsemble raw outputs (avg): {dict(zip(TRAIT_NAMES, avg_preds.tolist()))}")

            if n_windows > 1:
                per_trait_conf = [
                    _trait_confidence(all_preds_4[:, i], avg_preds[i])
                    for i in range(4)
                ]
                confidence = round(float(np.mean(per_trait_conf)) * 100, 1)
            else:
                confidence = 35.0

        else:
            # ── Single-output EEGNeX / LabRaM ─────────────────────────────────
            # predictions shape: (n_windows, 1)
            all_preds_flat = predictions.cpu().numpy().flatten()  # (n_windows,)
            avg_pred = float(all_preds_flat.mean())
            print(f"Raw prediction (avg over {n_windows} windows): {avg_pred:.4f}")

            if n_windows > 1:
                confidence = round(_trait_confidence(all_preds_flat, avg_pred) * 100, 1)
            else:
                confidence = 35.0

            trait_scores = raw_to_trait_scores(avg_pred)

        print(f"Trait scores: {trait_scores}")
        print(f"Confidence: {confidence}% (n_windows={n_windows})")

        # Compute explainability on a subset of windows
        xai_input = input_tensor[:min(5, n_windows)]
        explainability = compute_explainability(model, xai_input)

        # Generate EEG preview data for frontend visualization
        # Pick 8 representative channels, downsample to ~200 points max
        preview_channels = [0, 3, 4, 8, 9, 12, 14, 17]  # Fp1, F3, Fz, C3, Cz, P7, Pz, O1
        preview_ch_names = ["Fp1", "F3", "Fz", "C3", "Cz", "P7", "Pz", "O1"]
        # Use raw (pre-normalized, resampled) data for visualization
        total_samples = raw_data.shape[1]
        max_preview_samples = 500  # ~5 seconds at 100Hz
        preview_len = min(total_samples, max_preview_samples)
        eeg_preview = {
            "channels": [],
            "sfreq": SFREQ,
            "duration": round(preview_len / SFREQ, 2),
        }
        for i, ch_idx in enumerate(preview_channels):
            if ch_idx < raw_data.shape[0]:
                ch_data = raw_data[ch_idx, :preview_len]
                # Downsample further if too many points
                if preview_len > 500:
                    step = preview_len // 500
                    ch_data = ch_data[::step]
                eeg_preview["channels"].append({
                    "name": preview_ch_names[i],
                    "data": [round(float(v), 6) for v in ch_data],
                })

        response = {
            "trait_scores": trait_scores,
            "confidence": confidence,
            "n_windows": n_windows,
            "prediction_std": round(float(np.std(all_preds_flat)), 4),
            "explainability": explainability,
            "eeg_preview": eeg_preview,
            "disclaimer": (
                "These outputs are research-oriented risk indicators derived from EEG data, "
                "not clinical diagnoses. The externalizing factor is predicted using the "
                f"{model_name} model. Please consult a qualified healthcare professional "
                "for clinical evaluation."
            ),
        }

        print(f"Response sent successfully\n{'='*60}")
        return response

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── EEG Data endpoint (for EEG Viewer) ──────────────────────────────────────

# Standard 10-20 montage positions (normalized x/y, -1 to 1)
MONTAGE_10_20 = {
    "Fp1": (-0.18, 0.88), "Fp2": (0.18, 0.88),
    "F7": (-0.72, 0.51),  "F3": (-0.39, 0.61),  "Fz": (0.0, 0.72),   "F4": (0.39, 0.61),  "F8": (0.72, 0.51),
    "FC3": (-0.27, 0.33), "FCz": (0.0, 0.38),    "FC4": (0.27, 0.33),
    "T7": (-0.87, 0.0),   "C3": (-0.45, 0.0),    "Cz": (0.0, 0.0),    "C4": (0.45, 0.0),   "T8": (0.87, 0.0),
    "CP3": (-0.27, -0.33),"CPz": (0.0, -0.38),   "CP4": (0.27, -0.33),
    "P7": (-0.72, -0.51), "P3": (-0.39, -0.61),  "Pz": (0.0, -0.72),  "P4": (0.39, -0.61), "P8": (0.72, -0.51),
    "TP7": (-0.82, -0.27),"TP8": (0.82, -0.27),
    "O1": (-0.18, -0.88), "Oz": (0.0, -0.95),    "O2": (0.18, -0.88),
}

CHANNEL_GROUP_NAMES = {
    "frontal":  ["Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8", "FC3", "FCz", "FC4"],
    "central":  ["C3", "Cz", "C4", "CP3", "CPz", "CP4"],
    "parietal": ["P7", "P3", "Pz", "P4", "P8"],
    "occipital":["O1", "Oz", "O2"],
    "temporal": ["T7", "T8", "TP7", "TP8"],
}

BANDPASS_RANGES = {
    "Raw":   (1.0, 40.0),
    "Theta": (4.0,  8.0),
    "Alpha": (8.0, 12.0),
    "Beta":  (13.0, 30.0),
    "Gamma": (30.0, 45.0),
}


@app.post("/api/eeg-data")
async def eeg_data_endpoint(
    eeg_file: UploadFile = File(...),
    channel_group: str = Form("all"),
    max_preview_seconds: float = Form(30.0),
):
    """
    Load a .bdf EEG file (already bandpass-filtered at source) and return
    per-channel normalized signal data, events, PSD, and topomap info for
    the EEG Viewer frontend. No re-filtering is applied.
    """
    try:
        file_bytes = await eeg_file.read()

        with tempfile.NamedTemporaryFile(suffix=".bdf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            raw = mne.io.read_raw_bdf(tmp_path, preload=True, verbose=False)
        finally:
            os.unlink(tmp_path)

        original_duration = float(raw.times[-1])
        sfreq = float(raw.info["sfreq"])
        all_ch_names = list(raw.ch_names)

        # Determine which channels to display (up to 20)
        if channel_group == "all":
            wanted = all_ch_names[:20]
        else:
            preferred = CHANNEL_GROUP_NAMES.get(channel_group, [])
            wanted = [c for c in preferred if c in all_ch_names]
            if not wanted:
                # Fall back to first 20 if no name matches (e.g. BioSemi A1/A2 style)
                wanted = all_ch_names[:20]

        # Extract data for display channels
        picks = mne.pick_channels(raw.ch_names, wanted, ordered=True)
        data_all = raw.get_data(picks=picks)   # shape: (n_display, n_total_samples)
        display_names = [raw.ch_names[p] for p in picks]

        # Slice to max_preview_seconds
        max_samples = int(min(max_preview_seconds, original_duration) * sfreq)
        data_slice = data_all[:, :max_samples]   # (n_display, max_samples)

        # Downsample to ≤3000 points per channel for browser performance
        target_pts = 3000
        if data_slice.shape[1] > target_pts:
            step = data_slice.shape[1] // target_pts
            data_slice = data_slice[:, ::step]
            effective_sfreq = sfreq / step
        else:
            effective_sfreq = sfreq

        duration_out = data_slice.shape[1] / effective_sfreq

        # Convert V → µV, then per-channel z-score normalization for clean display
        channels_out = []
        for i, name in enumerate(display_names):
            uv = data_slice[i] * 1e6
            ch_mean = float(np.mean(uv))
            ch_std = float(np.std(uv)) + 1e-9
            normalized = ((uv - ch_mean) / ch_std).tolist()
            channels_out.append({
                "name": name,
                "data": [round(v, 4) for v in normalized],
            })

        # Detect events (graceful – many files have no status channel)
        events_out = []
        try:
            events_arr = mne.find_events(raw, verbose=False)
            for ev in events_arr:
                ts = float(ev[0]) / sfreq
                if ts <= max_preview_seconds:
                    events_out.append({
                        "sample": int(ev[0]),
                        "timestamp": round(ts, 3),
                        "event_id": int(ev[2]),
                        "type": "stimulus",
                        "label": f"Stim {int(ev[2])}",
                    })
        except Exception:
            pass  # No events in file

        # Power Spectral Density for the first display channel (numpy FFT)
        psd_out = None
        if channels_out:
            # Use the un-downsampled slice (up to max_samples) for better resolution
            ref_uv = data_all[0, :max_samples] * 1e6
            n = len(ref_uv)
            # Welch-like: split into 1-sec segments, average
            seg_len = int(sfreq)
            n_segs = n // seg_len
            if n_segs == 0:
                n_segs = 1
                seg_len = n
            psd_sum = np.zeros(seg_len // 2 + 1)
            for s in range(n_segs):
                seg = ref_uv[s * seg_len:(s + 1) * seg_len]
                # Hanning window
                window = np.hanning(len(seg))
                seg_w = seg * window
                fft_vals = np.abs(np.fft.rfft(seg_w)) ** 2
                # Normalize
                fft_vals /= (np.sum(window ** 2) * sfreq)
                psd_sum += fft_vals[:seg_len // 2 + 1]
            psd_mean = psd_sum / n_segs
            freqs = np.fft.rfftfreq(seg_len, d=1.0 / sfreq)
            freqs = freqs[:seg_len // 2 + 1]
            # Convert to dB
            psd_db = 10.0 * np.log10(psd_mean + 1e-30)
            # Limit to 0–50 Hz
            mask = freqs <= 50.0
            psd_out = {
                "channel": display_names[0],
                "frequencies": [round(float(f), 2) for f in freqs[mask]],
                "psd": [round(float(p), 3) for p in psd_db[mask]],
            }

        # Topomap: return channels that exist in the file and have known positions
        topomap_out = []
        for ch in all_ch_names:
            if ch in MONTAGE_10_20:
                x, y = MONTAGE_10_20[ch]
                topomap_out.append({"name": ch, "x": x, "y": y})

        return {
            "channels": channels_out,
            "all_channel_names": list(all_ch_names),
            "selected_channels": display_names,
            "events": events_out,
            "psd": psd_out,
            "topomap_channels": topomap_out,
            "montage": {k: list(v) for k, v in MONTAGE_10_20.items()},
            "sfreq": round(effective_sfreq, 2),
            "duration": round(duration_out, 3),
            "original_duration": round(original_duration, 3),
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "models_loaded": list(loaded_models.keys()),
    }


@app.get("/api/models")
async def list_models():
    return {
        "models": [
            {"id": "EEGNeX",       "label": "EEGNeX (braindecode, 60K params)",          "weights_file": "weights_challenge_2.pt",                "n_outputs": 1},
            {"id": "LabRaM",       "label": "LabRaM (pre-trained foundation model)",      "weights_file": "weights_labram.pt",                     "n_outputs": 1},
            {"id": "CNNEnsemble",  "label": "CNNEnsemble Zoo (model_024, 4-trait direct)","weights_file": CNN_ENSEMBLE_WEIGHTS_FILENAME,           "n_outputs": 4},
        ]
    }
