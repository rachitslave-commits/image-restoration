"""Old Photo Restoration & Colorization — Flask web app.

Author : Rachit Joshi (S24CSEU0298)
Local  : python app.py  →  http://127.0.0.1:5000
Vercel : vercel deploy  (colorization disabled — model too large for serverless)
"""
import base64
import os

import cv2
import numpy as np
from flask import Flask, render_template, request, jsonify

import pipeline

app = Flask(__name__)

MAX_SIDE = 1200          # cap the longest edge before processing


# ------------------------------------------------------------------ helpers --

def _decode_upload(file_storage):
    raw = file_storage.read()
    # Try colour first so we preserve the original coloured input for display
    img_color = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    img_gray  = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_GRAYSCALE)
    return img_color, img_gray


def _resize_color(img):
    h, w = img.shape[:2]
    if max(h, w) > MAX_SIDE:
        s = MAX_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


def _resize_gray(img):
    h, w = img.shape
    if max(h, w) > MAX_SIDE:
        s = MAX_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


def _to_data_url(img_bgr):
    """BGR ndarray → PNG data-URL (converts BGR→RGB for the browser)."""
    if img_bgr.ndim == 2:                     # grayscale
        img_bgr = cv2.cvtColor(img_bgr, cv2.COLOR_GRAY2BGR)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    ok, buf = cv2.imencode(".jpg", img_rgb, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _to_dl_url(img_bgr):
    """BGR ndarray → PNG data-URL for lossless download."""
    if img_bgr.ndim == 2:
        img_bgr = cv2.cvtColor(img_bgr, cv2.COLOR_GRAY2BGR)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    ok, buf = cv2.imencode(".png", img_rgb)
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


# ------------------------------------------------------------------ routes ---

@app.route("/")
def index():
    return render_template(
        "index.html",
        colorize_available=pipeline.models_available(),
    )


@app.route("/process", methods=["POST"])
def process():
    f = request.files.get("image")
    if f is None or not f.filename:
        return jsonify(error="No image uploaded."), 400

    img_color, img_gray = _decode_upload(f)
    if img_gray is None:
        return jsonify(error="Could not read that file as an image."), 400

    img_color = _resize_color(img_color)
    img_gray  = _resize_gray(img_gray)

    do_restore = request.form.get("restore") == "1"
    do_color   = request.form.get("colorize") == "1"
    simulate   = request.form.get("simulate") == "1"

    try:
        denoise = int(float(request.form.get("denoise", 20)))
        clip    = float(request.form.get("clip", 1.5))
        scratch = int(float(request.form.get("scratch", 55)))
        sharp   = float(request.form.get("sharp", 1.3))
    except (ValueError, TypeError):
        return jsonify(error="Invalid parameter value."), 400

    clean_ref   = img_gray.copy()
    display_in  = img_color.copy()          # shown as "input" in compare view

    if simulate:
        img_gray   = pipeline.add_damage(img_gray)
        display_in = cv2.cvtColor(img_gray, cv2.COLOR_GRAY2BGR)

    result_gray = img_gray.copy()
    if do_restore:
        result_gray = pipeline.restore(result_gray, denoise, clip, scratch, sharp)

    result_out = result_gray.copy()         # start as grayscale
    out_is_color = False
    if do_color and pipeline.models_available():
        result_out   = pipeline.colorize(result_gray)  # returns BGR
        out_is_color = True
    else:
        result_out = cv2.cvtColor(result_gray, cv2.COLOR_GRAY2BGR)

    metrics = None
    if simulate:
        p_before, s_before = pipeline.scores(clean_ref, img_gray)
        p_after,  s_after  = pipeline.scores(clean_ref, result_gray)
        metrics = dict(
            psnr_before=round(p_before, 2),
            psnr_after =round(p_after,  2),
            psnr_delta =round(p_after - p_before, 2),
            ssim_before=round(s_before, 3),
            ssim_after =round(s_after,  3),
            ssim_delta =round(s_after - s_before, 3),
        )

    return jsonify(
        input_image   = _to_data_url(display_in),
        output_image  = _to_data_url(result_out),
        download_url  = _to_dl_url(result_out),
        output_is_color = out_is_color,
        colorize_available = pipeline.models_available(),
        metrics = metrics,
    )


# -------------------------------------------------------------------- main ---

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  Old Photo Restoration & Colorization")
    print(f"  http://127.0.0.1:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False)
