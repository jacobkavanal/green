# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build web visualization (DSC 106 final project) showing global MODIS NDVI vegetation intensity and 2000→2025 change as 3D extrusion "spikes" on a Mapbox GL globe. Four plain files do all the work: `index.html`, `grid.js`, `main.js`, `style.css`. No package.json, no bundler, no framework, no tests.

## Running it

Must be served over HTTP — the app `fetch`es files under `data/` and registers a service worker, both of which fail on `file://`.

```bash
python3 -m http.server 8000
```

The service worker (`sw.js`) permanently caches anything under `/data/` in the `greening-earth-data-v2` cache. After regenerating data files, bump `CACHE_NAME` or unregister the worker in DevTools, or the browser will keep serving stale data. (The `activate` handler deletes caches whose name doesn't match, so bumping is enough.)

## Data pipeline

Two stages. The first needs the source rasters; the second does not.

**Stage 1 — rasters to GeoJSON.** `build_actual_ndvi_spikes.py` converts MODIS MOD13A3 GeoTIFFs into GeoJSON in `data/`. It expects `actual_modis_ndvi_raw/MOD13A3_NDVI_{2000,2013,2025}.tif`, which are **not** in the repo (multi-GB rasters). Requires `numpy` and `rasterio`.

```bash
python3 build_actual_ndvi_spikes.py
```

It emits 12 files: three years × three detail levels, plus a precomputed 2000→2025 change file per detail level. Detail level = raster block size (`DETAIL_LEVELS`: low 80, medium 45, high 35 pixels per block) — smaller block = more, finer features.

**Stage 2 — GeoJSON to binary grids.** `build_grid_tiles.py` converts those GeoJSON files into the compact `data/grid/*.grid` files the site actually loads, plus `data/grid/manifest.json`. Pure standard library, no rasters needed.

```bash
python3 build_grid_tiles.py
```

**The GeoJSON files in `data/*.json` are inputs to stage 2 and the only surviving source for it — do not delete them.** Stage 1 cannot regenerate them without the rasters, which aren't here. The site never fetches them.

Key transforms in stage 1, which the rest of the system depends on:
- NDVI is percentile-stretched (p05–p95) into `greenness` (0–1) and a piecewise `height` in meters (`ndvi_to_height`) — the exaggerated height curve is deliberate, for visual contrast. **The stretch is fitted per year**, not shared across years.
- Change cells are shrunk (`CHANGE_CELL_SCALE`) so growth and decline spikes don't visually merge; year cells get a tiny overlap pad (`BLOCK_PAD`) instead, to hide seams.
- `ndvi_to_height` is discontinuous at `norm = 0.35`, jumping from ~9,200 m to ~80,700 m. A handful of cells sit close enough to that cliff that rounding decides which side they land on.

### The grid format

Every cell in the GeoJSON is an axis-aligned rectangle on a perfectly regular lattice (cell size is exactly `block_size / 120` degrees, since MODIS pixels are 1/120°), so its corners are arithmetic on a row/column index. `build_grid_tiles.py` throws that redundancy away and keeps one `int16` per cell.

A `.grid` file is a 50-byte little-endian header — magic `GRID`, version, band count, cols, rows, origin lon/lat, cell lon/lat, p05, p95 — followed by `cols × rows` int16 values, `NDVI × 10000`, with `-32768` meaning no data. Year files carry `ndvi`; change files carry `change`. `decodeGrid()` in `grid.js` is the matching reader; the two must be changed together.

This is ~41× smaller than the GeoJSON for year files and ~22× for change files: **349 MB of GeoJSON becomes 8.2 MB of grid.** The whole planet at high detail is 1.2 MB.

`greenness` and `height` are *not* stored — they are recomputed per cell from `ndvi` and the header's p05/p95, mirroring the Python. `ndvi_old`/`ndvi_new` are dropped, since only `change` is ever read.

The conversion is faithful to within quantization: coordinates match to 5e-7°, NDVI and change to 5e-5, greenness to 7e-5. About 10–21 cells per file (0.01%) are dropped — clipped partial blocks at the antimeridian that don't sit on the lattice.

`Proposal/` holds the earlier exploratory work (GIBS WMS image downloads, matplotlib figures) and is not part of the running site. Its scripts contain hardcoded Windows paths from a teammate's machine.

## Architecture of `grid.js`

Loaded before `main.js`; plain script, no modules. Owns everything about the NDVI cell grid, behind two seams:

- `loadGrid(dataset, detail)` — fetches and decodes a `.grid` into `{cols, rows, originLon, originLat, cellLon, cellLat, p05, p95, values}` where `values` is an `Int16Array` view over the file buffer. Caches the *promise*, keyed by `dataset-detail`, so concurrent callers share one fetch. `dataset` is `"2000"` / `"2013"` / `"2025"` / `"change"`; paths come from the manifest, never hardcoded.
- `globeCollection(dataset, detail)` — builds a Mapbox-ready `FeatureCollection` for the whole planet, cached.

**Materialization is whole-globe on purpose, and this is measured, not assumed.** Building every feature on Earth at the finest detail — 195,125 of them — takes about **12 ms**. Handing that collection to Mapbox via `setData()` costs orders of magnitude more, because `setData` reprocesses the *entire* source every call.

That asymmetry is the whole design. An earlier version scoped materialization to 15° viewport tiles; it cut feature counts ~7× but still called `setData` on every pan, so panning paid the expensive half of the work while saving only the cheap half. Holding the whole globe means **panning issues zero `setData` calls** and costs nothing. Features move only when the detail level or a dataset changes.

If you are ever tempted to reintroduce viewport scoping, measure `setData` latency first — and measure it in a **foregrounded** tab. A backgrounded tab throttles the renderer and inflates these numbers by more than 10×, which is exactly how the original tiled design got justified.

Built collections are cached under `COLLECTION_CACHE_BUDGET`, counted in features rather than entries, evicted oldest-first, and never evicted down to empty. The budget is sized for the heaviest legitimate view — compare mode at high detail, two globes at ~195k features each.

Area is closed-form per row (`rowAreaKm2`) since a cell is a lat/lon rectangle — it replaces the old per-feature spherical-excess loop.

## Architecture of `main.js`

One ~2400-line file of top-level `const`s, module-level mutable state, and `setup*()` functions, all wired up by `initAllMaps()` after all three maps fire `load`. Sections are marked with `/* === */` banner comments — follow that convention when adding code.

Three Mapbox maps exist simultaneously and are never destroyed: `singleMap` (present + change modes) and `leftMap`/`rightMap` (compare mode). CSS shows and hides them via a `mode-present` / `mode-compare` / `mode-change` class on `<body>`; `setMode()` sets that class and repositions cameras. Compare maps are given `emptyGeoJSON` when not in use — `clearCompareMaps()` does this, and it matters for memory.

Layers: `spikes-layer` (source `spikes`) on all three maps for NDVI intensity; `change-spikes-layer` (source `change-spikes`) on `singleMap` only. Both are `fill-extrusion`, colored and sized by data-driven expressions in `getSpikePaint()` / `getChangePaint()`, which read `greenness`/`height` and `change` — the properties `grid.js` synthesizes.

State lives in module-level `let`s near the top: `currentMode`, `activeView`, `compareBaseYear`, `activeDetail`, and `activeDataSignature` (a `"dataset(s)@detail"` string per mode — e.g. `"2000+2025@medium"` — which is what makes a redundant refresh cheap to detect).

**`refreshVisibleData(force)` is the single path that puts data on a map.** It reads the active mode's camera, picks a detail level via `detailFromZoom()` / `changeDetailFromZoom()`, builds the signature, and returns early if it already matches. A 250 ms-debounced `moveend` handler on all three maps calls it. **A pan leaves the signature unchanged, so it returns immediately and no `setData` happens** — that is the mechanism that keeps panning smooth, and it is easy to break by putting anything camera-position-dependent into the signature. `isLoadingDetail` guards against overlapping refreshes.

**Order matters in `setMode()`:** it positions cameras *first*, then awaits `refreshVisibleData(true)`. Anything that moves a map and needs new data follows the same shape — move, then refresh with `force`.

`preloadLikelyNextFiles()` warms the four medium grids 1.5 s after startup (~2.9 MB total), then builds the `2025-medium` collection in a `requestIdleCallback` so the first zoom-in doesn't pay for it. It deliberately prebuilds only that one — building every collection would exceed the cache budget and evict what is on screen.

Compare-mode camera sync (`syncCompareMaps()`) uses a `syncing` boolean re-entrancy guard — mirroring `move` events between two maps will infinite-loop without it.

Regional summary charts are computed **in the browser** from the medium-detail grids: `computeRegionChartStats()` scans the `Int16Array` inside a `regionBounds` box via `gridMeanNdvi()` and `gridChangeTotals()`. This takes about 1 ms, so `chartStatsCache` is now a convenience rather than a necessity.

The narrative layer — splash screen, 5-step guided tour (`tourSteps`), per-region story text (`storyText`), and the final takeaway panel — drives `setMode()` and `flyTo` as a side effect, so changing mode/view logic can break the tour.

## Conventions

- Theming is a `data-theme` attribute (`auto` / `light` / `dark`) on `<html>`, set by an inline script in `<head>` before paint to avoid a flash, persisted to `localStorage` under `theme-preference`. `style.css` defines tokens on `:root` and overrides them for `[data-theme="dark"]` **and** for `[data-theme="auto"]` inside `@media (prefers-color-scheme: dark)` — a new themed color needs both blocks or it will break in one mode.
- `main.js` and `grid.js` use a narrow-column style: one argument or property per line, blank lines between logical steps. It reads oddly for JS but is consistent throughout; match it.
- `grid.js` mirrors constants from `build_actual_ndvi_spikes.py` (`BLOCK_PAD`, `CHANGE_CELL_SCALE`, the `ndvi_to_height` curve). Changing one without the other silently shifts geometry or heights — they are marked with comments on both sides.
- The Mapbox access token is a public `pk.` token hardcoded at `main.js:1`, owned by a teammate's account.
- Region definitions are duplicated across `views` (camera), `regionBounds` (stats filtering), `storyText`, and the `#region-select` options in `index.html` — adding a region means touching all four.
