/* =========================================================
   NDVI cell grid

   The spike data is a regular lattice of rectangular cells, so it is stored as
   a binary grid (see build_grid_tiles.py) rather than as GeoJSON: a 50-byte
   header plus one int16 per cell. Everything else about a cell - its corners,
   its greenness, its extrusion height - is arithmetic on the cell's row and
   column, and is recomputed here.

   Two seams live in this file:

     loadGrid()         turns a dataset + detail level into a decoded grid.
     globeCollection()  turns that grid into Mapbox-ready features.

   Materialization is whole-globe on purpose. Building every feature on Earth
   costs about 200 ms at the finest detail, but handing a FeatureCollection to
   Mapbox costs several times that - and setData() reprocesses the entire
   source every call, so a viewport-scoped source pays that price on every pan.
   Holding the whole globe means panning changes nothing and costs nothing; the
   only time features move is when the detail level itself changes.
   ========================================================= */

const GRID_MANIFEST_URL = "data/grid/manifest.json";

const GRID_HEADER_BYTES = 50;
const GRID_NODATA = -32768;
const NDVI_SCALE = 10000;

/* Must match build_actual_ndvi_spikes.py. */
const BLOCK_PAD = 0.001;
const CHANGE_CELL_SCALE = 0.55;

/* The endpoint years of the precomputed change grid - CHANGE_PAIRS in
   build_actual_ndvi_spikes.py. buildChangeFeatures() reads both to find the
   land the change grid leaves out. */
const CHANGE_YEARS = ["2000", "2025"];

/* Built collections are cached by feature count rather than by entry count,
   since a high-detail globe holds five times what a low-detail one does.

   The heaviest legitimate view is compare mode at high detail: two globes at
   about 195,000 features each. This budget holds that plus a smaller globe,
   and puts a hard ceiling on what a long session can accumulate. */
const COLLECTION_CACHE_BUDGET = 500000;

/* =========================================================
   Cell math
   ========================================================= */

function clamp01(value) {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

/* Mirrors ndvi_to_height() in build_actual_ndvi_spikes.py. */
function ndviToHeight(norm) {
  if (norm < 0.15) {
    return 300;
  }

  if (norm < 0.35) {
    return 1200 + ((norm - 0.15) / 0.20) * 8000;
  }

  return 9000 + Math.pow(norm, 2.1) * 650000;
}

/* =========================================================
   Decoding
   ========================================================= */

function decodeGrid(buffer) {
  const view = new DataView(buffer);

  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );

  if (magic !== "GRID") {
    throw new Error(
      `Not a grid file (magic ${magic})`
    );
  }

  const cols = view.getUint16(6, true);
  const rows = view.getUint16(8, true);

  return {
    version: view.getUint8(4),
    bands: view.getUint8(5),
    cols,
    rows,
    originLon: view.getFloat64(10, true),
    originLat: view.getFloat64(18, true),
    cellLon: view.getFloat64(26, true),
    cellLat: view.getFloat64(34, true),
    p05: view.getFloat32(42, true),
    p95: view.getFloat32(46, true),

    values: new Int16Array(
      buffer,
      GRID_HEADER_BYTES,
      cols * rows
    )
  };
}

/* =========================================================
   Materialization
   ========================================================= */

function buildYearFeatures(grid) {
  const features = [];

  const span = grid.p95 - grid.p05 + 1e-9;

  const halfLon = (grid.cellLon / 2) * (1 + BLOCK_PAD);
  const halfLat = (grid.cellLat / 2) * (1 + BLOCK_PAD);

  for (let row = 0; row < grid.rows; row += 1) {
    const centerLat =
      grid.originLat + (row + 0.5) * grid.cellLat;

    const south = centerLat - halfLat;
    const north = centerLat + halfLat;

    const rowOffset = row * grid.cols;

    for (let col = 0; col < grid.cols; col += 1) {
      const raw = grid.values[rowOffset + col];

      if (raw === GRID_NODATA) {
        continue;
      }

      const ndvi = raw / NDVI_SCALE;

      const greenness = clamp01(
        (ndvi - grid.p05) / span
      );

      const centerLon =
        grid.originLon + (col + 0.5) * grid.cellLon;

      const west = centerLon - halfLon;
      const east = centerLon + halfLon;

      features.push({
        type: "Feature",

        properties: {
          ndvi,
          greenness,
          height: ndviToHeight(greenness)
        },

        geometry: {
          type: "Polygon",

          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south]
          ]]
        }
      });
    }
  }

  return features;
}

/*
  Change cells, plus the cells that did not change.

  build_actual_ndvi_spikes.py drops any block whose change falls below
  CHANGE_THRESHOLD, so steady land is simply absent from the change grid -
  indistinguishable, in the file, from ocean. The year grids still cover it,
  though, so a cell both year grids hold and the change grid does not is land
  that held steady. Those come back here carrying `still`, which
  getChangePaint() draws as a low grey block rather than a spike.
*/
function buildChangeFeatures(grid, oldGrid, newGrid) {
  const features = [];

  const halfLon =
    (grid.cellLon / 2) * CHANGE_CELL_SCALE;

  const halfLat =
    (grid.cellLat / 2) * CHANGE_CELL_SCALE;

  /* All three datasets share one lattice at a given detail level, which is
     what makes a cell index mean the same thing in each of them. */
  const stillCells =
    oldGrid.cols === grid.cols &&
    oldGrid.rows === grid.rows &&
    newGrid.cols === grid.cols &&
    newGrid.rows === grid.rows;

  for (let row = 0; row < grid.rows; row += 1) {
    const centerLat =
      grid.originLat + (row + 0.5) * grid.cellLat;

    const south = centerLat - halfLat;
    const north = centerLat + halfLat;

    const rowOffset = row * grid.cols;

    for (let col = 0; col < grid.cols; col += 1) {
      const index = rowOffset + col;
      const raw = grid.values[index];

      let properties;

      if (raw !== GRID_NODATA) {
        properties = {
          change: raw / NDVI_SCALE
        };
      } else if (
        stillCells &&
        oldGrid.values[index] !== GRID_NODATA &&
        newGrid.values[index] !== GRID_NODATA
      ) {
        properties = {
          change: 0,
          still: 1
        };
      } else {
        continue;
      }

      const centerLon =
        grid.originLon + (col + 0.5) * grid.cellLon;

      const west = centerLon - halfLon;
      const east = centerLon + halfLon;

      features.push({
        type: "Feature",

        properties,

        geometry: {
          type: "Polygon",

          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south]
          ]]
        }
      });
    }
  }

  return features;
}

/* =========================================================
   Area

   A grid cell is a lat/lon rectangle, so its area is closed-form and depends
   only on its row. The old per-feature spherical-excess loop is gone.
   ========================================================= */

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

function rowAreaKm2(grid, row, scale) {
  const centerLat =
    grid.originLat + (row + 0.5) * grid.cellLat;

  const halfLat = (grid.cellLat / 2) * scale;

  const south = (centerLat - halfLat) * DEG_TO_RAD;
  const north = (centerLat + halfLat) * DEG_TO_RAD;

  const lonSpan =
    grid.cellLon * scale * DEG_TO_RAD;

  return (
    EARTH_RADIUS_KM *
    EARTH_RADIUS_KM *
    lonSpan *
    Math.abs(Math.sin(north) - Math.sin(south))
  );
}

/* =========================================================
   Store

   Grids are small enough to keep whole (the entire planet at high detail is
   1.2 MB), so the store caches decoded grids outright. Materialized features
   are the expensive part, so those are held under a budget.
   ========================================================= */

const gridStore = {
  manifest: null,
  manifestPromise: null,
  grids: {},
  collections: new Map(),
  collectionFeatureCount: 0
};

async function loadManifest() {
  if (gridStore.manifest) {
    return gridStore.manifest;
  }

  if (!gridStore.manifestPromise) {
    gridStore.manifestPromise = fetch(GRID_MANIFEST_URL)
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `Failed to load grid manifest: ${response.status}`
          );
        }

        return response.json();
      })
      .then(manifest => {
        gridStore.manifest = manifest;

        return manifest;
      });
  }

  return gridStore.manifestPromise;
}

function gridUrl(manifest, dataset, detail) {
  const entry = manifest.details[detail];

  if (!entry) {
    throw new Error(`Unknown detail level: ${detail}`);
  }

  if (dataset === "change") {
    return entry.change;
  }

  const year = entry.years[dataset];

  if (!year) {
    throw new Error(`Unknown dataset: ${dataset}`);
  }

  return year.file;
}

/*
  Decoded grid for one dataset at one detail level.

  Caches the promise rather than the result, so concurrent callers share a
  single fetch.
*/
async function loadGrid(dataset, detail) {
  const key = `${dataset}-${detail}`;

  if (!gridStore.grids[key]) {
    gridStore.grids[key] = loadManifest()
      .then(manifest =>
        fetch(`data/${gridUrl(manifest, dataset, detail)}`)
      )
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `Failed to load grid ${key}: ${response.status}`
          );
        }

        return response.arrayBuffer();
      })
      .then(decodeGrid);
  }

  return gridStore.grids[key];
}

function evictCollections() {
  while (
    gridStore.collectionFeatureCount >
      COLLECTION_CACHE_BUDGET &&
    gridStore.collections.size > 1
  ) {
    const oldest =
      gridStore.collections.keys().next().value;

    const collection =
      gridStore.collections.get(oldest);

    gridStore.collections.delete(oldest);

    gridStore.collectionFeatureCount -=
      collection.features.length;
  }
}

/*
  A Mapbox-ready FeatureCollection covering the whole globe for one dataset at
  one detail level.

  Cached, because the cost is worth paying once: as long as the map holds the
  whole globe, panning needs no setData at all.
*/
async function globeCollection(dataset, detail) {
  const key = `${dataset}-${detail}`;
  const cached = gridStore.collections.get(key);

  if (cached) {
    /* Refresh recency. */
    gridStore.collections.delete(key);
    gridStore.collections.set(key, cached);

    return cached;
  }

  let features;

  if (dataset === "change") {
    /* The change grid alone cannot tell steady land from ocean, so the two
       endpoint years are loaded with it. They are cached and usually already
       resident, so this costs a cache hit rather than a fetch. */
    const [
      grid,
      oldGrid,
      newGrid
    ] = await Promise.all([
      loadGrid(dataset, detail),
      loadGrid(CHANGE_YEARS[0], detail),
      loadGrid(CHANGE_YEARS[1], detail)
    ]);

    features = buildChangeFeatures(
      grid,
      oldGrid,
      newGrid
    );
  } else {
    const grid = await loadGrid(dataset, detail);

    features = buildYearFeatures(grid);
  }

  const collection = {
    type: "FeatureCollection",
    features
  };

  gridStore.collections.set(key, collection);
  gridStore.collectionFeatureCount += features.length;

  evictCollections();

  return collection;
}

/* =========================================================
   Statistics

   Region summaries read the grid directly. Scanning an Int16Array in a
   bounding box replaces the old walk over every feature of four global
   GeoJSON files.
   ========================================================= */

function boundsCellRange(grid, bounds) {
  const [
    lonMin,
    lonMax,
    latMin,
    latMax
  ] = bounds;

  let colStart = Math.floor(
    (lonMin - grid.originLon) / grid.cellLon
  );

  let colEnd = Math.ceil(
    (lonMax - grid.originLon) / grid.cellLon
  );

  let rowStart = Math.floor(
    (latMin - grid.originLat) / grid.cellLat
  );

  let rowEnd = Math.ceil(
    (latMax - grid.originLat) / grid.cellLat
  );

  return {
    colStart: Math.max(0, colStart),
    colEnd: Math.min(grid.cols, colEnd),
    rowStart: Math.max(0, rowStart),
    rowEnd: Math.min(grid.rows, rowEnd)
  };
}

function cellCenterInBounds(grid, row, col, bounds) {
  const lon =
    grid.originLon + (col + 0.5) * grid.cellLon;

  const lat =
    grid.originLat + (row + 0.5) * grid.cellLat;

  return (
    lon >= bounds[0] &&
    lon <= bounds[1] &&
    lat >= bounds[2] &&
    lat <= bounds[3]
  );
}

/* Mean NDVI over the cells whose centers fall inside `bounds`. */
function gridMeanNdvi(grid, bounds) {
  const range = boundsCellRange(grid, bounds);

  let total = 0;
  let count = 0;

  for (
    let row = range.rowStart;
    row < range.rowEnd;
    row += 1
  ) {
    const rowOffset = row * grid.cols;

    for (
      let col = range.colStart;
      col < range.colEnd;
      col += 1
    ) {
      const raw = grid.values[rowOffset + col];

      if (raw === GRID_NODATA) {
        continue;
      }

      if (
        !cellCenterInBounds(grid, row, col, bounds)
      ) {
        continue;
      }

      total += raw;
      count += 1;
    }
  }

  if (!count) {
    return null;
  }

  return total / count / NDVI_SCALE;
}

/* Growth / decline cell counts and areas inside `bounds`. */
function gridChangeTotals(grid, bounds) {
  const range = boundsCellRange(grid, bounds);

  let growthCount = 0;
  let declineCount = 0;
  let addedAreaKm2 = 0;
  let lostAreaKm2 = 0;

  for (
    let row = range.rowStart;
    row < range.rowEnd;
    row += 1
  ) {
    const rowOffset = row * grid.cols;

    const cellArea = rowAreaKm2(
      grid,
      row,
      CHANGE_CELL_SCALE
    );

    for (
      let col = range.colStart;
      col < range.colEnd;
      col += 1
    ) {
      const raw = grid.values[rowOffset + col];

      if (raw === GRID_NODATA || raw === 0) {
        continue;
      }

      if (
        !cellCenterInBounds(grid, row, col, bounds)
      ) {
        continue;
      }

      if (raw > 0) {
        growthCount += 1;
        addedAreaKm2 += cellArea;
      } else {
        declineCount += 1;
        lostAreaKm2 += cellArea;
      }
    }
  }

  return {
    growthCount,
    declineCount,
    addedAreaKm2,
    lostAreaKm2
  };
}
