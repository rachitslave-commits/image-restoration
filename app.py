"""Old Photo Restoration & Colorization
Author: Rachit Joshi (S24CSEU0298)

Local:  python app.py  →  http://127.0.0.1:5001
Vercel: git push → auto-deploy (colorization disabled; restore fully works)
"""
import base64, os
import cv2
import numpy as np
from flask import Flask, send_from_directory, request, jsonify
import pipeline

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

app = Flask(__name__, static_folder=None)

# Vercel serves public/ from its CDN automatically.
# For local dev we serve them through Flask.
@app.route("/public/<path:filename>")
def serve_public(filename):
    return send_from_directory(PUBLIC, filename)

@app.route("/")
def index():
    return send_from_directory(PUBLIC, "index.html")

# ── helpers ───────────────────────────────────────────────────────────────────
MAX_SIDE = 900   # cap longest edge (client pre-scales, this is a safety net)

def _decode(raw_bytes):
    arr = np.frombuffer(raw_bytes, np.uint8)
    return (
        cv2.imdecode(arr, cv2.IMREAD_COLOR),
        cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE),
    )

def _cap(img, is_gray):
    dim = img.shape[:2] if is_gray else img.shape[:2]
    h, w = dim
    if max(h, w) > MAX_SIDE:
        s = MAX_SIDE / max(h, w)
        interp = cv2.INTER_AREA
        if is_gray:
            return cv2.resize(img, (int(w*s), int(h*s)), interpolation=interp)
        return cv2.resize(img, (int(w*s), int(h*s)), interpolation=interp)
    return img

def _jpg(bgr):
    if bgr.ndim == 2:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    _, buf = cv2.imencode(".jpg", rgb, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

def _png(bgr):
    if bgr.ndim == 2:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    _, buf = cv2.imencode(".png", rgb)
    return "data:image/png;base64," + base64.b64encode(buf).decode()

# ── process ───────────────────────────────────────────────────────────────────
@app.route("/process", methods=["POST"])
def process():
    f = request.files.get("image")
    if not f or not f.filename:
        return jsonify(error="No image uploaded."), 400

    raw = f.read()
    color, gray = _decode(raw)
    if gray is None:
        return jsonify(error="Cannot read image."), 400

    color = _cap(color, False)
    gray  = _cap(gray,  True)

    do_restore = request.form.get("restore")  == "1"
    do_color   = request.form.get("colorize") == "1"
    simulate   = request.form.get("simulate") == "1"

    try:
        denoise = int(float(request.form.get("denoise", 20)))
        clip    = float(request.form.get("clip",    1.5))
        scratch = int(float(request.form.get("scratch", 55)))
        sharp   = float(request.form.get("sharp",   1.3))
    except (ValueError, TypeError):
        return jsonify(error="Invalid parameter."), 400

    clean_ref  = gray.copy()
    display_in = color.copy()

    if simulate:
        gray       = pipeline.add_damage(gray)
        display_in = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    result = gray.copy()
    if do_restore:
        result = pipeline.restore(result, denoise, clip, scratch, sharp)
    restored_gray = result.copy()

    out_is_color = False
    if do_color and pipeline.models_available():
        result       = pipeline.colorize(result)
        out_is_color = True
    else:
        result = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)

    metrics = None
    if simulate:
        pb, sb = pipeline.scores(clean_ref, gray)
        pa, sa = pipeline.scores(clean_ref, restored_gray)
        metrics = dict(
            psnr_before=round(pb, 2), psnr_after=round(pa, 2),
            psnr_delta =round(pa-pb, 2),
            ssim_before=round(sb, 3), ssim_after=round(sa, 3),
            ssim_delta =round(sa-sb, 3),
        )

    return jsonify(
        input_image        = _jpg(display_in),
        output_image       = _jpg(result),
        download_url       = _png(result),
        output_is_color    = out_is_color,
        colorize_available = pipeline.models_available(),
        metrics            = metrics,
    )

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"\n  Open http://127.0.0.1:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False)
