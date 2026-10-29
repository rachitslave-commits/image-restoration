"""Old Photo Restoration & Colorization — core pipeline.

Author: Rachit Joshi (S24CSEU0298)

CLI usage:
    python pipeline.py input.jpg output.jpg
"""
import os
import sys

import cv2
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
PROTO   = os.path.join(MODEL_DIR, "colorization_deploy_v2.prototxt")
WEIGHTS = os.path.join(MODEL_DIR, "colorization_release_v2.caffemodel")
POINTS  = os.path.join(MODEL_DIR, "pts_in_hull.npy")


# ─────────────────────────────────────────── restoration ──────────────────────

def restore(gray: np.ndarray,
            denoise_strength: int   = 20,
            clip_limit: float       = 1.5,
            scratch_threshold: int  = 55,
            sharpen: float          = 1.3) -> np.ndarray:
    """Clean a grayscale uint8 image: denoise → contrast → scratch repair → sharpen."""
    # 1. Denoise (non-local means)
    den = cv2.fastNlMeansDenoising(
        gray, None,
        h=float(denoise_strength),
        templateWindowSize=7,
        searchWindowSize=21,
    )
    # 2. Contrast enhancement (CLAHE)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enh = clahe.apply(den)

    # 3. Scratch repair — thin bright lines that stand out from a median-blurred copy
    diff = cv2.subtract(enh, cv2.medianBlur(enh, 21))
    _, mask = cv2.threshold(diff, scratch_threshold, 255, cv2.THRESH_BINARY)
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    fixed = cv2.inpaint(enh, mask, 3, cv2.INPAINT_TELEA)

    # 4. Sharpen (unsharp mask)
    soft = cv2.GaussianBlur(fixed, (0, 0), 3)
    return cv2.addWeighted(fixed, sharpen, soft, 1.0 - sharpen, 0)


# ─────────────────────────────────────────── colorization ─────────────────────

_MIN_SIZES = {
    PROTO:   5_000,          # .prototxt  ~10 KB
    WEIGHTS: 100_000_000,    # .caffemodel ~123 MB
    POINTS:  3_000,          # .npy       ~5 KB
}

def models_available() -> bool:
    return all(
        os.path.exists(p) and os.path.getsize(p) >= _MIN_SIZES[p]
        for p in (PROTO, WEIGHTS, POINTS)
    )


_net = None


def _load_net():
    global _net
    if _net is None:
        net = cv2.dnn.readNetFromCaffe(PROTO, WEIGHTS)
        pts = np.load(POINTS).transpose().reshape(2, 313, 1, 1)
        net.getLayer(net.getLayerId("class8_ab")).blobs = [pts.astype("float32")]
        net.getLayer(net.getLayerId("conv8_313_rh")).blobs = [
            np.full([1, 313], 2.606, dtype="float32")
        ]
        _net = net
    return _net


def colorize(gray: np.ndarray) -> np.ndarray:
    """Predict colour for a grayscale uint8 image.

    Accepts either a 2-D grayscale array or a 3-channel BGR array.
    Returns a BGR uint8 image.
    """
    # normalise input to 2-D grayscale
    if gray.ndim == 3:
        gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)

    net = _load_net()
    bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    lab = cv2.cvtColor(bgr.astype("float32") / 255.0, cv2.COLOR_BGR2LAB)
    L_small = cv2.resize(lab, (224, 224))[:, :, 0] - 50.0   # centre L channel
    net.setInput(cv2.dnn.blobFromImage(L_small))
    ab  = net.forward()[0].transpose((1, 2, 0))              # (56, 56, 2)
    ab  = cv2.resize(ab, (gray.shape[1], gray.shape[0]))
    out = np.concatenate((lab[:, :, :1], ab), axis=2)
    out = np.clip(cv2.cvtColor(out, cv2.COLOR_LAB2BGR), 0, 1)
    return (out * 255).astype("uint8")


# ─────────────────────────────────────────── test helpers ─────────────────────

def add_damage(gray: np.ndarray,
               seed: int         = 0,
               noise_sigma: float = 18,
               n_scratches: int   = 12) -> np.ndarray:
    """Simulate age damage: grain + thin bright scratches. For evaluation only."""
    rng = np.random.default_rng(seed)
    img = gray.astype(np.float32)
    img += rng.normal(0, noise_sigma, img.shape)
    h, w = gray.shape
    for _ in range(n_scratches):
        x  = int(rng.integers(0, w))
        y  = int(rng.integers(0, h))
        dx = int(rng.integers(-30, 30))
        dy = int(rng.integers(h // 6, h // 2))
        cv2.line(img, (x, y), (x + dx, min(h - 1, y + dy)), 255, 1)
    return np.clip(img, 0, 255).astype(np.uint8)


def scores(reference: np.ndarray, result: np.ndarray):
    """Return (PSNR in dB, SSIM) between two grayscale images of the same size."""
    from skimage.metrics import peak_signal_noise_ratio, structural_similarity
    return (
        peak_signal_noise_ratio(reference, result),
        structural_similarity(reference, result),
    )


# ─────────────────────────────────────────── CLI ──────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python pipeline.py input.jpg output.jpg")
    src = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE)
    if src is None:
        sys.exit("could not read " + sys.argv[1])
    cleaned = restore(src)
    if models_available():
        cv2.imwrite(sys.argv[2], colorize(cleaned))
        print("colorized & saved →", sys.argv[2])
    else:
        print("Model files missing. Run download_models.py. Saving restored grayscale only.")
        cv2.imwrite(sys.argv[2], cleaned)
        print("saved →", sys.argv[2])
