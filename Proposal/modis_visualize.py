from pathlib import Path
import re

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

try:
    import rasterio
except ImportError:
    rasterio = None


# =========================
# File Inputs
# =========================

TIF_FILES = {
    2000: Path(
        r"D:\#UCSD\DSC 106\DSC106-Final_Project\actual_modis_ndvi_raw\MOD13A3_NDVI_2000.tif"
    ),
    2013: Path(
        r"D:\#UCSD\DSC 106\DSC106-Final_Project\actual_modis_ndvi_raw\MOD13A3_NDVI_2013.tif"
    ),
    2025: Path(
        r"D:\#UCSD\DSC 106\DSC106-Final_Project\actual_modis_ndvi_raw\MOD13A3_NDVI_2025.tif"
    ),
}

BASE_YEAR = 2000
COMPARE_YEAR = 2025


# =========================
# Settings
# =========================

FIG_DIR = Path("figures")
FIG_DIR.mkdir(exist_ok=True)

REGIONS = {
    "Amazon Basin": (-80, -45, -20, 10),
    "Sahel / West Africa": (-20, 35, 5, 20),
    "South Asia": (65, 100, 5, 35),
    "Northern China / Inner Mongolia": (95, 125, 35, 47),
}


# =========================
# Color Maps
# =========================

ndvi_cmap = LinearSegmentedColormap.from_list(
    "modis_ndvi_style",
    [
        "#000000",  # water / no vegetation
        "#d8c7aa",  # barren
        "#b7d56b",  # sparse vegetation
        "#69b83f",  # moderate vegetation
        "#168b25",  # dense vegetation
        "#005b17",  # very dense vegetation
    ],
)

change_cmap = LinearSegmentedColormap.from_list(
    "ndvi_change_style",
    [
        "#8c510a",  # decline
        "#dfc27d",
        "#f7f7f7",
        "#80cdc1",
        "#01665e",  # growth
    ],
)


# =========================
# Helpers
# =========================

def parse_year_from_path(path):
    match = re.search(r"(19|20)\d{2}", Path(path).name)
    return int(match.group(0)) if match else None


def clamp(value, low, high):
    return max(low, min(high, value))


def read_ndvi_tif(path):
    if rasterio is None:
        raise ImportError(
            "rasterio is required. Install with: conda install -c conda-forge rasterio"
        )

    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(f"Could not find file: {path}")

    with rasterio.open(path) as src:
        arr = src.read(1).astype("float32")
        transform = src.transform
        nodata = src.nodata
        bounds = src.bounds
        crs = src.crs

    if nodata is not None:
        arr[arr == nodata] = np.nan

    finite = arr[np.isfinite(arr)]

    # MOD13A3 NDVI usually uses scale factor 0.0001.
    if finite.size > 0 and np.nanmax(np.abs(finite)) > 2:
        arr = arr * 0.0001

    arr[(arr < -0.2) | (arr > 1.0)] = np.nan

    return {
        "path": path,
        "year": parse_year_from_path(path),
        "arr": arr,
        "transform": transform,
        "bounds": bounds,
        "crs": crs,
        "extent": [bounds.left, bounds.right, bounds.bottom, bounds.top],
    }


def load_all_tifs():
    data = {}

    for year, path in TIF_FILES.items():
        print(f"Loading {year}: {path}")
        data[year] = read_ndvi_tif(path)
        print(f"  shape: {data[year]['arr'].shape}")
        print(f"  CRS: {data[year]['crs']}")

    return data


def crop_array_by_bbox(data, bbox):
    arr = data["arr"]
    transform = data["transform"]

    lon_min, lon_max, lat_min, lat_max = bbox

    inv = ~transform

    col_min, row_max = inv * (lon_min, lat_min)
    col_max, row_min = inv * (lon_max, lat_max)

    row_min = int(clamp(np.floor(row_min), 0, arr.shape[0] - 1))
    row_max = int(clamp(np.ceil(row_max), 0, arr.shape[0]))
    col_min = int(clamp(np.floor(col_min), 0, arr.shape[1] - 1))
    col_max = int(clamp(np.ceil(col_max), 0, arr.shape[1]))

    if row_max <= row_min or col_max <= col_min:
        return None

    crop = arr[row_min:row_max, col_min:col_max]
    extent = [lon_min, lon_max, lat_min, lat_max]

    return crop, extent


def savefig(filename):
    save_path = FIG_DIR / filename
    plt.savefig(save_path, dpi=200, bbox_inches="tight")
    plt.show()
    print(f"Saved: {save_path}")


# =========================
# Figure 1
# Regional zoom comparison
# =========================

def plot_regional_zoom_comparison(data):
    old_data = data[BASE_YEAR]
    new_data = data[COMPARE_YEAR]

    fig, axes = plt.subplots(len(REGIONS), 2, figsize=(12, 13))

    for row, (region_name, bbox) in enumerate(REGIONS.items()):
        old_result = crop_array_by_bbox(old_data, bbox)
        new_result = crop_array_by_bbox(new_data, bbox)

        if old_result is None or new_result is None:
            axes[row, 0].set_title(f"{region_name} — no data")
            axes[row, 1].set_title(f"{region_name} — no data")
            axes[row, 0].axis("off")
            axes[row, 1].axis("off")
            continue

        old_crop, old_extent = old_result
        new_crop, new_extent = new_result

        axes[row, 0].imshow(
            old_crop,
            extent=old_extent,
            origin="upper",
            cmap=ndvi_cmap,
            vmin=-0.05,
            vmax=0.9,
        )
        axes[row, 0].set_title(f"{region_name} — {BASE_YEAR}", fontsize=12)
        axes[row, 0].axis("off")

        axes[row, 1].imshow(
            new_crop,
            extent=new_extent,
            origin="upper",
            cmap=ndvi_cmap,
            vmin=-0.05,
            vmax=0.9,
        )
        axes[row, 1].set_title(f"{region_name} — {COMPARE_YEAR}", fontsize=12)
        axes[row, 1].axis("off")

    fig.suptitle(
        f"Regional MODIS NDVI Comparison: {BASE_YEAR} vs {COMPARE_YEAR}",
        fontsize=16,
    )

    plt.tight_layout()
    savefig("01_regional_zoom_comparison.png")


# =========================
# Figure 2
# Regional NDVI bar chart
# =========================

def plot_regional_ndvi_bar_chart(data):
    old_data = data[BASE_YEAR]
    new_data = data[COMPARE_YEAR]

    labels = []
    old_values = []
    new_values = []

    for region_name, bbox in REGIONS.items():
        old_result = crop_array_by_bbox(old_data, bbox)
        new_result = crop_array_by_bbox(new_data, bbox)

        old_mean = np.nan
        new_mean = np.nan

        if old_result is not None:
            old_crop, _ = old_result
            old_mean = float(np.nanmean(old_crop))

        if new_result is not None:
            new_crop, _ = new_result
            new_mean = float(np.nanmean(new_crop))

        labels.append(region_name)
        old_values.append(old_mean)
        new_values.append(new_mean)

    x = np.arange(len(labels))
    width = 0.35

    plt.figure(figsize=(11, 6))
    plt.bar(x - width / 2, old_values, width, label=str(BASE_YEAR))
    plt.bar(x + width / 2, new_values, width, label=str(COMPARE_YEAR))

    plt.title(
        f"Average Actual NDVI by Region: {BASE_YEAR} vs {COMPARE_YEAR}",
        fontsize=15,
    )
    plt.xlabel("Region")
    plt.ylabel("Average NDVI")
    plt.xticks(x, labels, rotation=10, ha="right")
    plt.ylim(0, 1)
    plt.legend()
    plt.grid(axis="y", alpha=0.25)
    plt.tight_layout()

    savefig("02_regional_ndvi_bar_chart.png")


# =========================
# Figure 3
# Side-by-side world comparison
# =========================

def plot_side_by_side(data):
    old_data = data[BASE_YEAR]
    new_data = data[COMPARE_YEAR]

    fig, axes = plt.subplots(1, 2, figsize=(18, 7))

    axes[0].imshow(
        old_data["arr"],
        extent=old_data["extent"],
        origin="upper",
        cmap=ndvi_cmap,
        vmin=-0.05,
        vmax=0.9,
    )
    axes[0].set_title(str(BASE_YEAR), fontsize=15)
    axes[0].axis("off")

    axes[1].imshow(
        new_data["arr"],
        extent=new_data["extent"],
        origin="upper",
        cmap=ndvi_cmap,
        vmin=-0.05,
        vmax=0.9,
    )
    axes[1].set_title(str(COMPARE_YEAR), fontsize=15)
    axes[1].axis("off")

    fig.suptitle(
        f"MODIS Terra Monthly NDVI Comparison: {BASE_YEAR} vs {COMPARE_YEAR}",
        fontsize=18,
    )

    plt.tight_layout()
    savefig(f"03_side_by_side_{BASE_YEAR}_{COMPARE_YEAR}.png")


# =========================
# Figure 4
# Small multiples
# =========================

def plot_small_multiples(data):
    years = sorted(data.keys())

    fig, axes = plt.subplots(1, len(years), figsize=(6 * len(years), 5))

    if len(years) == 1:
        axes = [axes]

    for ax, year in zip(axes, years):
        ax.imshow(
            data[year]["arr"],
            extent=data[year]["extent"],
            origin="upper",
            cmap=ndvi_cmap,
            vmin=-0.05,
            vmax=0.9,
        )
        ax.set_title(str(year), fontsize=14)
        ax.axis("off")

    fig.suptitle("MODIS Terra Monthly NDVI Across Selected Years", fontsize=18)

    plt.tight_layout()
    savefig("04_small_multiples_actual_ndvi.png")


# =========================
# Figure 5
# Actual NDVI difference
# =========================

def plot_actual_ndvi_difference(data):
    old_data = data[BASE_YEAR]
    new_data = data[COMPARE_YEAR]

    old_arr = old_data["arr"]
    new_arr = new_data["arr"]

    if old_arr.shape != new_arr.shape:
        raise ValueError(
            f"GeoTIFF shapes do not match: {old_arr.shape} vs {new_arr.shape}"
        )

    diff = new_arr - old_arr

    plt.figure(figsize=(14, 6))
    plt.imshow(
        diff,
        extent=new_data["extent"],
        origin="upper",
        cmap=change_cmap,
        vmin=-0.3,
        vmax=0.3,
    )
    plt.colorbar(label=f"Actual NDVI difference ({COMPARE_YEAR} − {BASE_YEAR})")
    plt.axis("off")
    plt.title(
        f"Actual NDVI Difference: MODIS NDVI {COMPARE_YEAR} − {BASE_YEAR}",
        fontsize=15,
    )

    plt.tight_layout()
    savefig(f"05_actual_ndvi_difference_{COMPARE_YEAR}_minus_{BASE_YEAR}.png")


# =========================
# Main
# =========================

def main():
    data = load_all_tifs()

    plot_regional_zoom_comparison(data)
    plot_regional_ndvi_bar_chart(data)
    plot_side_by_side(data)
    plot_small_multiples(data)
    plot_actual_ndvi_difference(data)

    print("All visualizations complete.")


if __name__ == "__main__":
    main()