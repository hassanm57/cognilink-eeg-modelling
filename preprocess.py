import mne
import numpy as np

def load_and_preprocess_bdf(file_path):
    raw = mne.io.read_raw_bdf(file_path, preload=True, verbose=False)

    # No bandpass filtering — already done upstream
    raw.resample(100)

    data = raw.get_data()  # shape: (channels, time)

    # Take first 2 seconds for demo
    samples = 200
    data = data[:, :samples]

    # Normalize
    data = (data - np.mean(data)) / (np.std(data) + 1e-6)

    # Shape for CNN: (1, 1, channels, time)
    data = data[np.newaxis, np.newaxis, :, :]

    return data.astype(np.float32)
