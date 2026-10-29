"""Download the pretrained colorization model (Zhang, Isola, Efros 2016) into ./models.

Run once:  python download_models.py

If the .caffemodel download fails, open this URL in a browser, save it to the models/
folder and keep the exact filename colorization_release_v2.caffemodel:
  https://www.dropbox.com/s/dx0qvhhp5hbcx7z/colorization_release_v2.caffemodel?dl=1

Expected sizes:
  colorization_deploy_v2.prototxt  ~  10 KB
  pts_in_hull.npy                  ~   5 KB
  colorization_release_v2.caffemodel ~ 123 MB
"""
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "models")
os.makedirs(DEST, exist_ok=True)

# Min acceptable sizes in bytes (guards against HTML error pages)
MIN_SIZES = {
    "colorization_deploy_v2.prototxt":    5_000,
    "pts_in_hull.npy":                    3_000,
    "colorization_release_v2.caffemodel": 100_000_000,  # ~123 MB
}

FILES = {
    "colorization_deploy_v2.prototxt": [
        "https://raw.githubusercontent.com/richzhang/colorization/caffe/colorization/models/colorization_deploy_v2.prototxt",
    ],
    "pts_in_hull.npy": [
        "https://raw.githubusercontent.com/richzhang/colorization/caffe/colorization/resources/pts_in_hull.npy",
    ],
    "colorization_release_v2.caffemodel": [
        # Dropbox (primary — Berkeley mirror is dead)
        "https://www.dropbox.com/s/dx0qvhhp5hbcx7z/colorization_release_v2.caffemodel?dl=1",
    ],
}

for name, urls in FILES.items():
    path = os.path.join(DEST, name)
    min_sz = MIN_SIZES.get(name, 1000)

    if os.path.exists(path) and os.path.getsize(path) >= min_sz:
        print(f"  OK  {name}  ({os.path.getsize(path) // 1024:,} KB)")
        continue

    downloaded = False
    for url in urls:
        try:
            host = url.split("/")[2]
            print(f"Downloading {name} from {host} ...")
            urllib.request.urlretrieve(url, path)
            sz = os.path.getsize(path)
            if sz < min_sz:
                print(f"  ERROR: file too small ({sz} bytes) — likely a failed download, removing.")
                os.remove(path)
                continue
            print(f"  saved  {sz // 1024:,} KB")
            downloaded = True
            break
        except Exception as e:
            print(f"  failed: {e}")

    if not downloaded:
        print(f"\n  COULD NOT DOWNLOAD {name}")
        print(f"  Please download it manually from:\n    {urls[0]}\n  and place it in: {DEST}\n")
