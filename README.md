# Old Photo Restoration & Colorization

IMDAI project · Rachit Joshi (S24CSEU0298)

## Setup (local)

```bash
pip install -r requirements.txt
python download_models.py   # downloads the ~123 MB colorization model
python app.py               # opens http://127.0.0.1:5001
```

> **Note:** Port 5000 is reserved by macOS AirPlay. The app defaults to the `PORT` env variable (defaults to 5001 if you set it, otherwise 5000).

## Vercel deployment

Colorization is disabled on Vercel (the 123 MB model can't be bundled in a serverless function).
Restoration (denoise, contrast, scratch repair, sharpen) works fully.

```bash
npm i -g vercel
vercel deploy
```

## Features

- Drag-and-drop photo upload
- Denoise · contrast boost (CLAHE) · scratch repair · sharpen
- Colorization via Zhang, Isola & Efros 2016 deep learning model
- Before / after comparison slider
- Side-by-side view
- Test mode: damage a photo first and measure PSNR / SSIM improvement
- Lossless PNG download

## Command line

```bash
python pipeline.py old_photo.jpg result.jpg
```
