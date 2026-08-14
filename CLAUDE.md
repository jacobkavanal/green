# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build web visualization (DSC 106 final project) showing global MODIS NDVI vegetation intensity and 2000→2025 change as 3D extrusion "spikes" on a Mapbox GL globe. Three plain files do all the work: `index.html`, `main.js`, `style.css`. No package.json, no bundler, no framework, no tests.

## Running it

Must be served over HTTP — the app `fetch`es `data/*.json` and registers a service worker, both of which fail on `file://`.

```bash
python3 -m http.server 8000
```

The service worker (`sw.js`) permanently caches anything under `/data/` in the `greening-earth-data-v1` cache. After regenerating data files, bump `CACHE_NAME` or unregister the worker in DevTools, or the browser will keep serving stale JSON.

## Data pipeline

`build_actual_ndvi_spikes.py` converts MODIS MOD13A3 GeoTIFFs into the GeoJSON files in `data/`. It expects `actual_modis_ndvi_raw/MOD13A3_NDVI_{2000,2013,2025}.tif`, which are **not** in the repo (multi-GB rasters). Requires `numpy` and `rasterio`.

```bash
python3 build_actual_ndvi_spikes.py
```

It emits 12 files: three years × three detail levels, plus a precomputed 2000→2025 change file per detail level. Detail level = raster block size (`DETAIL_LEVELS`: low 80, medium 45, high 35 pixels per block) — smaller block = more, finer features. Outputs are large (low ~9 MB, high ~46 MB per year), so changing `DETAIL_LEVELS`, `CHANGE_THRESHOLD`, or `COORD_PRECISION` has a direct and significant effect on page load time.

Key transforms in that script, which the frontend depends on:
- NDVI is percentile-stretched (p05–p95) into `greenness` (0–1) and a piecewise `height` in meters (`ndvi_to_height`) — the exaggerated height curve is deliberate, for visual contrast.
- Feature properties are `ndvi`/`greenness`/`height` for year files, and `change`/`ndvi_old`/`ndvi_new` for change files. `main.js` reads these names directly in its paint expressions and popups.
- Change cells are shrunk (`CHANGE_CELL_SCALE`) so growth and decline spikes don't visually merge; year cells get a tiny overlap pad instead, to hide seams.

`Proposal/` holds the earlier exploratory work (GIBS WMS image downloads, matplotlib figures) and is not part of the running site. Its scripts contain hardcoded Windows paths from a teammate's machine.

## Architecture of `main.js`

One ~2500-line file of top-level `const`s, module-level mutable state, and `setup*()` functions, all wired up by `initAllMaps()` after all three maps fire `load`. Sections are marked with `/* === */` banner comments — follow that convention when adding code.

Three Mapbox maps exist simultaneously and are never destroyed: `singleMap` (present + change modes) and `leftMap`/`rightMap` (compare mode). CSS shows and hides them via a `mode-present` / `mode-compare` / `mode-change` class on `<body>`; `setMode()` sets that class and swaps source data. Compare maps are given `emptyGeoJSON` when not in use so they don't hold ~46 MB of features in the background — `clearCompareMaps()` does this, and it matters for memory.

Layers: `spikes-layer` (source `spikes`) on all three maps for NDVI intensity; `change-spikes-layer` (source `change-spikes`) on `singleMap` only. Both are `fill-extrusion`, colored and sized by data-driven expressions in `getSpikePaint()` / `getChangePaint()` reading the feature properties named above.

State lives in module-level `let`s near the top: `currentMode`, `activeView`, `compareBaseYear`, `activeDetail`, plus `cachedData`/`cachedChangeData` which memoize *promises* (not resolved values) keyed by `year-detail`, so concurrent requests share one fetch.

**Level-of-detail switching is the main performance mechanism.** `detailFromZoom()` / `changeDetailFromZoom()` map the current zoom and region to low/medium/high; a 300 ms-debounced `zoomend` handler calls `loadDetailForCurrentView()` to swap in a different file. `isLoadingDetail` guards against overlapping swaps. `preloadLikelyNextFiles()` warms the medium-detail files 1.5 s after startup.

Compare-mode camera sync (`syncCompareMaps()`) uses a `syncing` boolean re-entrancy guard — mirroring `move` events between two maps will infinite-loop without it.

Regional summary charts are computed **in the browser** from the medium-detail GeoJSON: `computeRegionChartStats()` filters features by `regionBounds`, averages NDVI per year, and sums growth/decline cell counts and areas (`polygonAreaKm2` uses a spherical-excess approximation). Results are memoized in `chartStatsCache` since the scan is expensive.

The narrative layer — splash screen, 5-step guided tour (`tourSteps`), per-region story text (`storyText`), and the final takeaway panel — drives `setMode()` and `flyTo` as a side effect, so changing mode/view logic can break the tour.

## Conventions

- Theming is a `data-theme` attribute (`auto` / `light` / `dark`) on `<html>`, set by an inline script in `<head>` before paint to avoid a flash, persisted to `localStorage` under `theme-preference`. `style.css` defines tokens on `:root` and overrides them for `[data-theme="dark"]` **and** for `[data-theme="auto"]` inside `@media (prefers-color-scheme: dark)` — a new themed color needs both blocks or it will break in one mode.
- `main.js` uses a narrow-column style: one argument or property per line, blank lines between logical steps. It reads oddly for JS but is consistent throughout; match it.
- The Mapbox access token is a public `pk.` token hardcoded at `main.js:1`, owned by a teammate's account.
- Region definitions are duplicated across `views` (camera), `regionBounds` (stats filtering), `storyText`, and the `#region-select` options in `index.html` — adding a region means touching all four.
