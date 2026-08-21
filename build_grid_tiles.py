"""
Convert the exported GeoJSON spike files into compact binary grid files.

The GeoJSON files describe a perfectly regular lattice of rectangular cells,
but spend ~60% of their bytes writing out corner coordinates that are pure
arithmetic on a row/column index. This script throws that redundancy away and
keeps only what is actually per-cell: the NDVI value.

Input   data/actual_ndvi_spikes_{year}_{detail}.json
        data/actual_ndvi_change_2000_2025_{detail}.json

Output  data/grid/{year}_{detail}.grid           (band: ndvi)
        data/grid/change_2000_2025_{detail}.grid (band: change)
        data/grid/manifest.json

This runs on the exported GeoJSON rather than on the source rasters, so it
works without the multi-GB MOD13A3 GeoTIFFs that build_actual_ndvi_spikes.py
needs. The GeoJSON files remain the source of truth for this stage - do not
delete them.

    python3 build_grid_tiles.py
"""

import json
import math
import os
import struct

# Must match build_actual_ndvi_spikes.py.
DETAIL_LEVELS = {
    "low": 80,
    "medium": 45,
    "high": 35,
    
}

BLOCK_PAD = 0.001
CHANGE_CELL_SCALE = 0.55

YEARS = ["2000", "2013", "2025"]
CHANGE_PAIR = ("2000", "2025")

# MOD13A3 pixel size in degrees (30 arc-seconds).
PIXEL_DEG = 1.0 / 120.0

DATA_DIR = "data"
OUT_DIR = os.path.join(DATA_DIR, "grid")

MAGIC = b"GRID"
FORMAT_VERSION = 1

# int16 sentinel for "no data in this cell".
NODATA = -32768

# NDVI is stored as round(ndvi * NDVI_SCALE) in an int16.
NDVI_SCALE = 10000.0

# Cells whose center misses the lattice by more than this fraction of a cell
# are clipped partial blocks at the raster edge, and are dropped.
LATTICE_TOLERANCE = 0.01


def cell_size(detail):
    return DETAIL_LEVELS[detail] * PIXEL_DEG


def year_path(year, detail):
    return os.path.join(
        DATA_DIR,
        f"actual_ndvi_spikes_{year}_{detail}.json"
    )


def change_path(detail):
    old_year, new_year = CHANGE_PAIR

    return os.path.join(
        DATA_DIR,
        f"actual_ndvi_change_{old_year}_{new_year}_{detail}.json"
    )


def read_features(path):
    with open(path) as handle:
        return json.load(handle)["features"]


def feature_center(feature):
    """
    Recover the cell center from its polygon.

    Year cells were emitted with a small outward pad and change cells with an
    inward scale, but both are symmetric about the center, so the center of the
    stored ring is the center of the underlying raster block either way.
    """
    ring = feature["geometry"]["coordinates"][0]

    lons = [point[0] for point in ring]
    lats = [point[1] for point in ring]

    return (
        (min(lons) + max(lons)) / 2,
        (min(lats) + max(lats)) / 2,
    )


def fit_percentiles(features):
    """
    Recover the p05/p95 percentile stretch used by build_actual_ndvi_spikes.py.

    greenness = clamp((ndvi - p05) / (p95 - p05), 0, 1)

    which is linear in ndvi wherever it is not clamped, so a least-squares fit
    over the interior points recovers both endpoints exactly.
    """
    ndvis = []
    greens = []

    for feature in features:
        properties = feature["properties"]
        greenness = properties["greenness"]

        if 0.02 < greenness < 0.98:
            ndvis.append(properties["ndvi"])
            greens.append(greenness)

    count = len(ndvis)

    mean_ndvi = sum(ndvis) / count
    mean_green = sum(greens) / count

    numerator = sum(
        (ndvi - mean_ndvi) * (green - mean_green)
        for ndvi, green in zip(ndvis, greens)
    )

    denominator = sum(
        (ndvi - mean_ndvi) ** 2
        for ndvi in ndvis
    )

    slope = numerator / denominator
    intercept = mean_green - slope * mean_ndvi

    span = 1.0 / slope
    p05 = -intercept * span

    return p05, p05 + span


def build_lattice(detail, sources):
    """
    Derive one canonical lattice per detail level, shared by every dataset at
    that detail, so a row/column index means the same thing across years and
    across the change file.
    """
    size = cell_size(detail)

    min_lon = None
    min_lat = None
    max_lon = None
    max_lat = None

    for features in sources:
        for feature in features:
            lon, lat = feature_center(feature)

            if min_lon is None or lon < min_lon:
                min_lon = lon

            if max_lon is None or lon > max_lon:
                max_lon = lon

            if min_lat is None or lat < min_lat:
                min_lat = lat

            if max_lat is None or lat > max_lat:
                max_lat = lat

    origin_lon = min_lon - size / 2
    origin_lat = min_lat - size / 2

    cols = int(round((max_lon - min_lon) / size)) + 1
    rows = int(round((max_lat - min_lat) / size)) + 1

    return {
        "size": size,
        "origin_lon": origin_lon,
        "origin_lat": origin_lat,
        "cols": cols,
        "rows": rows,
    }


def cell_index(lattice, lon, lat):
    """
    Map a cell center to (col, row), or None if it does not sit on the lattice.
    """
    size = lattice["size"]

    raw_col = (lon - lattice["origin_lon"]) / size - 0.5
    raw_row = (lat - lattice["origin_lat"]) / size - 0.5

    col = round(raw_col)
    row = round(raw_row)

    if abs(raw_col - col) > LATTICE_TOLERANCE:
        return None

    if abs(raw_row - row) > LATTICE_TOLERANCE:
        return None

    if not (0 <= col < lattice["cols"]):
        return None

    if not (0 <= row < lattice["rows"]):
        return None

    return col, row


def quantize(ndvi):
    value = int(round(ndvi * NDVI_SCALE))

    return max(-32767, min(32767, value))


def fill_band(lattice, features, key):
    """
    Rasterize one property of a feature list onto the lattice.
    """
    band = [NODATA] * (lattice["cols"] * lattice["rows"])
    dropped = 0

    for feature in features:
        lon, lat = feature_center(feature)
        index = cell_index(lattice, lon, lat)

        if index is None:
            dropped += 1
            continue

        col, row = index
        value = feature["properties"].get(key)

        if value is None:
            continue

        band[row * lattice["cols"] + col] = quantize(value)

    return band, dropped


def write_grid(path, lattice, bands, p05, p95):
    # 50-byte header: see grid.js decodeGrid() for the matching reader.
    header = struct.pack(
        "<4sBBHHddddff",
        MAGIC,
        FORMAT_VERSION,
        len(bands),
        lattice["cols"],
        lattice["rows"],
        lattice["origin_lon"],
        lattice["origin_lat"],
        lattice["size"],
        lattice["size"],
        p05,
        p95,
    )

    with open(path, "wb") as handle:
        handle.write(header)

        for band in bands:
            handle.write(
                struct.pack(f"<{len(band)}h", *band)
            )

    return os.path.getsize(path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    manifest = {
        "version": FORMAT_VERSION,
        "ndviScale": NDVI_SCALE,
        "nodata": NODATA,
        "details": {},
    }

    for detail in DETAIL_LEVELS:
        print(f"\n=== {detail} ===")

        year_features = {}

        for year in YEARS:
            path = year_path(year, detail)
            print(f"  reading {path}")
            year_features[year] = read_features(path)

        change_features = read_features(change_path(detail))
        print(f"  reading {change_path(detail)}")

        lattice = build_lattice(
            detail,
            list(year_features.values()) + [change_features]
        )

        print(
            f"  lattice {lattice['cols']}x{lattice['rows']} "
            f"cell={lattice['size']:.8f} "
            f"origin=({lattice['origin_lon']:.6f},{lattice['origin_lat']:.6f})"
        )

        detail_entry = {
            "cols": lattice["cols"],
            "rows": lattice["rows"],
            "cellLon": lattice["size"],
            "cellLat": lattice["size"],
            "originLon": lattice["origin_lon"],
            "originLat": lattice["origin_lat"],
            "years": {},
        }

        for year in YEARS:
            # Each year gets its own percentile stretch in
            # build_actual_ndvi_spikes.py, so fit each year separately.
            p05, p95 = fit_percentiles(year_features[year])
            print(f"  {year} stretch p05={p05:.6f} p95={p95:.6f}")

            band, dropped = fill_band(
                lattice,
                year_features[year],
                "ndvi"
            )

            name = f"{year}_{detail}.grid"
            size = write_grid(
                os.path.join(OUT_DIR, name),
                lattice,
                [band],
                p05,
                p95
            )

            source_size = os.path.getsize(year_path(year, detail))

            print(
                f"  {name:<24} {size/1e6:6.2f} MB "
                f"(from {source_size/1e6:6.2f} MB, "
                f"{source_size/size:5.1f}x, dropped {dropped})"
            )

            detail_entry["years"][year] = {
                "file": f"grid/{name}",
                "p05": p05,
                "p95": p95,
            }

        # Only `change` is ever read by the frontend - ndvi_old / ndvi_new stay
        # in the GeoJSON if they are ever wanted for a richer popup.
        change_band, dropped_change = fill_band(
            lattice,
            change_features,
            "change"
        )

        # The change layer colors and sizes itself from `change` alone, so the
        # stretch in this header is unused; write zeros rather than imply one.
        name = f"change_{CHANGE_PAIR[0]}_{CHANGE_PAIR[1]}_{detail}.grid"
        size = write_grid(
            os.path.join(OUT_DIR, name),
            lattice,
            [change_band],
            0.0,
            0.0
        )

        source_size = os.path.getsize(change_path(detail))

        print(
            f"  {name:<24} {size/1e6:6.2f} MB "
            f"(from {source_size/1e6:6.2f} MB, "
            f"{source_size/size:5.1f}x, dropped {dropped_change})"
        )

        detail_entry["change"] = f"grid/{name}"
        manifest["details"][detail] = detail_entry

    manifest_path = os.path.join(OUT_DIR, "manifest.json")

    with open(manifest_path, "w") as handle:
        json.dump(manifest, handle, indent=2)

    print(f"\nwrote {manifest_path}")


if __name__ == "__main__":
    main()
