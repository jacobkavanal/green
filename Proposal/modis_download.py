from pathlib import Path
from io import BytesIO
import requests
from PIL import Image

# =========================
# Settings
# =========================

OUT_DIR = Path("gibs_modis_images")
OUT_DIR.mkdir(exist_ok=True)

WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"

NDVI_LAYER = "MODIS_Terra_L3_NDVI_Monthly"

DATES = [
    "2012-07-01",
    "2014-07-01",
    "2016-07-01",
    "2018-07-01",
    "2020-07-01",
    "2023-07-01",
]

# Global map area
BBOX = (-180, -60, 180, 85)

WIDTH = 2400
HEIGHT = 1000


# =========================
# Download Function
# =========================

def download_gibs_wms_image(layer, date, out_path):
    """
    Download a MODIS image from NASA GIBS WMS.

    Uses NASA Worldview / GIBS API.
    Layer: MODIS_Terra_L3_NDVI_Monthly
    """

    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": layer,
        "STYLES": "",
        "FORMAT": "image/png",
        "TRANSPARENT": "false",
        "SRS": "EPSG:4326",
        "BBOX": ",".join(map(str, BBOX)),
        "WIDTH": str(WIDTH),
        "HEIGHT": str(HEIGHT),
        "TIME": date,
    }

    print(f"Downloading {date}...")

    response = requests.get(WMS_URL, params=params)
    response.raise_for_status()

    img = Image.open(BytesIO(response.content)).convert("RGB")
    img.save(out_path)

    print(f"Saved: {out_path}")


# =========================
# Main
# =========================

def main():
    for date in DATES:
        year = date[:4]
        out_path = OUT_DIR / f"modis_terra_ndvi_{year}_july.png"

        if out_path.exists():
            print(f"Already exists, skipping: {out_path}")
            continue

        download_gibs_wms_image(
            layer=NDVI_LAYER,
            date=date,
            out_path=out_path
        )

    print("Download complete.")


if __name__ == "__main__":
    main()