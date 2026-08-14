from pathlib import Path
import json
import numpy as np
import rasterio

# -----------------------------
# CONFIG
# -----------------------------
RAW_DIR = Path("actual_modis_ndvi_raw")
OUT_DIR = Path("data")
OUT_DIR.mkdir(exist_ok=True)

FILES = {
    "2000": RAW_DIR / "MOD13A3_NDVI_2000.tif",
    "2013": RAW_DIR / "MOD13A3_NDVI_2013.tif",
    "2025": RAW_DIR / "MOD13A3_NDVI_2025.tif",
}

# Level of detail files:
# low    = global view
# medium = region view
# high   = zoomed-in view
DETAIL_LEVELS = {
    "low": 80,
    "medium": 45,
    "high": 35,
}

# Pre-generate change files for these year pairs.
# This makes the webpage faster because main.js no longer needs to compute change.
CHANGE_PAIRS = [
    ("2000", "2025"),
]

# Small overlap to hide white seams between adjacent vegetation blocks.
# 0.000 = exact edges
# 0.001 = tiny overlap, usually best
# 0.005 = stronger overlap
BLOCK_PAD = 0.001

# Change cells should be smaller so growth/decline spikes do not merge together.
CHANGE_CELL_SCALE = 0.55

# Hide tiny changes to reduce noise and file size.
CHANGE_THRESHOLD = 0.025

# Coordinate precision for exported GeoJSON.
# 6 decimal places is still very precise for web maps.
COORD_PRECISION = 6

# Valid MODIS NDVI range after scale factor.
NDVI_MIN = -0.2
NDVI_MAX = 1.0


def clamp(value, low, high):
    return max(low, min(high, value))


def round_coord(value):
    return round(float(value), COORD_PRECISION)


def make_block_polygon(
    transform,
    row_start,
    col_start,
    row_end,
    col_end,
    pad=0.001,
    scale=1.0
):
    """
    Build polygon from exact raster block boundaries.

    pad gives a tiny overlap for normal vegetation blocks.
    scale can shrink change blocks so red/green spikes do not overlap too much.
    """
    x_left, y_top = transform * (col_start, row_start)
    x_right, y_bottom = transform * (col_end, row_end)

    west = min(x_left, x_right)
    east = max(x_left, x_right)
    south = min(y_top, y_bottom)
    north = max(y_top, y_bottom)

    cx = (west + east) / 2
    cy = (south + north) / 2

    half_w = (east - west) / 2
    half_h = (north - south) / 2

    if pad > 0:
        half_w *= (1 + pad)
        half_h *= (1 + pad)

    if scale != 1.0:
        half_w *= scale
        half_h *= scale

    west = round_coord(cx - half_w)
    east = round_coord(cx + half_w)
    south = round_coord(cy - half_h)
    north = round_coord(cy + half_h)

    return {
        "type": "Polygon",
        "coordinates": [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
        ]]
    }


def polygon_center(geometry):
    """
    Get center of a rectangular polygon.
    Used only for coordinate validation.
    """
    coords = geometry["coordinates"][0]

    lons = [p[0] for p in coords]
    lats = [p[1] for p in coords]

    return sum(lons) / len(lons), sum(lats) / len(lats)


def read_ndvi_tif(path):
    with rasterio.open(path) as src:
        arr = src.read(1).astype("float32")
        transform = src.transform
        nodata = src.nodata

    if nodata is not None:
        arr[arr == nodata] = np.nan

    # MOD13A3 NDVI is usually stored as scaled integer.
    # Scale factor is 0.0001.
    finite = arr[np.isfinite(arr)]

    if finite.size > 0 and np.nanmax(np.abs(finite)) > 2:
        arr = arr * 0.0001

    # Remove invalid NDVI values.
    arr[(arr < NDVI_MIN) | (arr > NDVI_MAX)] = np.nan

    return arr, transform


def block_mean(arr, row, col, block_size):
    block = arr[row:row + block_size, col:col + block_size]

    if block.size == 0:
        return np.nan

    finite = block[np.isfinite(block)]

    if finite.size == 0:
        return np.nan

    return float(np.nanmean(finite))


def ndvi_to_display_value(ndvi, p05, p95):
    """
    Convert actual NDVI into a 0–1 display value using percentile stretching.
    This improves visual contrast compared with raw NDVI.
    """
    norm = (ndvi - p05) / (p95 - p05 + 1e-9)
    return clamp(norm, 0, 1)


def ndvi_to_height(ndvi, p05, p95):
    """
    Stronger visual contrast:
    - very low NDVI stays almost flat
    - moderate NDVI becomes medium height
    - high NDVI becomes clearly tall
    """
    norm = ndvi_to_display_value(ndvi, p05, p95)

    if norm < 0.15:
        return 300

    if norm < 0.35:
        return 1200 + ((norm - 0.15) / 0.20) * 8000

    return 9000 + (norm ** 2.1) * 650000


def is_valid_map_coordinate(geometry):
    lon, lat = polygon_center(geometry)

    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return False

    if lat < -60 or lat > 85:
        return False

    return True


def convert_one_year_detail(year, tif_path, detail_name, block_size):
    if not tif_path.exists():
        raise FileNotFoundError(f"Missing file: {tif_path}")

    print(f"Reading {year} / {detail_name}: {tif_path}")
    arr, transform = read_ndvi_tif(tif_path)

    valid = arr[np.isfinite(arr)]
    valid = valid[(valid >= -0.05) & (valid <= 1.0)]

    if valid.size == 0:
        raise ValueError(f"No valid NDVI values found for {year}")

    p05 = np.percentile(valid, 5)
    p95 = np.percentile(valid, 95)

    print(f"{year} {detail_name} NDVI stretch: p05={p05:.3f}, p95={p95:.3f}")

    nrows, ncols = arr.shape
    features = []

    for row in range(0, nrows, block_size):
        for col in range(0, ncols, block_size):
            row_end = min(row + block_size, nrows)
            col_end = min(col + block_size, ncols)

            ndvi = block_mean(arr, row, col, block_size)

            if not np.isfinite(ndvi):
                continue

            # Skip mostly water / invalid negative values.
            # Keep barren land near zero because it is meaningful.
            if ndvi < -0.05:
                continue

            geometry = make_block_polygon(
                transform,
                row,
                col,
                row_end,
                col_end,
                pad=BLOCK_PAD,
                scale=1.0
            )

            if not is_valid_map_coordinate(geometry):
                continue

            greenness = ndvi_to_display_value(ndvi, p05, p95)
            height = ndvi_to_height(ndvi, p05, p95)

            features.append({
                "type": "Feature",
                "properties": {
                    "ndvi": round(float(ndvi), 5),
                    "greenness": round(float(greenness), 5),
                    "height": round(float(height), 2)
                },
                "geometry": geometry
            })

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    out_path = OUT_DIR / f"actual_ndvi_spikes_{year}_{detail_name}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    print(f"Saved {len(features):,} spikes to {out_path}")


def convert_change_detail(old_year, new_year, detail_name, block_size):
    old_path = FILES[old_year]
    new_path = FILES[new_year]

    if not old_path.exists():
        raise FileNotFoundError(f"Missing file: {old_path}")

    if not new_path.exists():
        raise FileNotFoundError(f"Missing file: {new_path}")

    print(f"Reading change {old_year} → {new_year} / {detail_name}")

    old_arr, old_transform = read_ndvi_tif(old_path)
    new_arr, new_transform = read_ndvi_tif(new_path)

    if old_arr.shape != new_arr.shape:
        raise ValueError(
            f"Raster shapes do not match for {old_year} and {new_year}: "
            f"{old_arr.shape} vs {new_arr.shape}"
        )

    if old_transform != new_transform:
        print(
            "Warning: raster transforms are not exactly identical. "
            "Using the newer year's transform for output geometry."
        )

    transform = new_transform

    nrows, ncols = new_arr.shape
    features = []

    for row in range(0, nrows, block_size):
        for col in range(0, ncols, block_size):
            row_end = min(row + block_size, nrows)
            col_end = min(col + block_size, ncols)

            old_ndvi = block_mean(old_arr, row, col, block_size)
            new_ndvi = block_mean(new_arr, row, col, block_size)

            if not np.isfinite(old_ndvi) or not np.isfinite(new_ndvi):
                continue

            # Skip mostly water / invalid negative areas.
            # If either year has meaningful land-like NDVI, keep it.
            if old_ndvi < -0.05 and new_ndvi < -0.05:
                continue

            change = new_ndvi - old_ndvi

            # Hide tiny changes to reduce visual noise and file size.
            if abs(change) < CHANGE_THRESHOLD:
                continue

            geometry = make_block_polygon(
                transform,
                row,
                col,
                row_end,
                col_end,
                pad=0.0,
                scale=CHANGE_CELL_SCALE
            )

            if not is_valid_map_coordinate(geometry):
                continue

            features.append({
                "type": "Feature",
                "properties": {
                    "change": round(float(change), 5),
                    "ndvi_old": round(float(old_ndvi), 5),
                    "ndvi_new": round(float(new_ndvi), 5)
                },
                "geometry": geometry
            })

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    out_path = OUT_DIR / (
        f"actual_ndvi_change_{old_year}_{new_year}_{detail_name}.json"
    )

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    print(f"Saved {len(features):,} change spikes to {out_path}")


def main():
    # 1. Generate normal vegetation spike files.
    for year, path in FILES.items():
        for detail_name, block_size in DETAIL_LEVELS.items():
            convert_one_year_detail(year, path, detail_name, block_size)

    # 2. Generate precomputed change files.
    for old_year, new_year in CHANGE_PAIRS:
        for detail_name, block_size in DETAIL_LEVELS.items():
            convert_change_detail(old_year, new_year, detail_name, block_size)


if __name__ == "__main__":
    main()