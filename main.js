mapboxgl.accessToken =
  "pk.eyJ1IjoieXV0YW9saW4iLCJhIjoiY21wNWI0MDl5MDlldTJwcTI3bmtkY3h3NiJ9.7aMzhLHSwm6BOedHTptjNA";

mapboxgl.workerCount = 4;

/* =========================================================
   Camera views
   ========================================================= */

const views = {
  global: {
    center: [15, 15],
    zoom: 1.55,
    pitch: 0,
    bearing: 0,
    offset: [0, 0]
  },

  amazon: {
    center: [-62, -7],
    zoom: 3.9,
    pitch: 50,
    bearing: -18,
    offset: [0, 0]
  },

  sahel: {
    center: [8, 14],
    zoom: 4.2,
    pitch: 50,
    bearing: 10,
    offset: [0, 0]
  },

  china: {
    center: [110, 41],
    zoom: 4.3,
    pitch: 50,
    bearing: -15,
    offset: [0, 0]
  }
};

if (window.innerWidth <= 650) {
  views.global.zoom = 1.15;
  views.global.pitch = 0;

  views.amazon.zoom = 3.35;
  views.amazon.pitch = 38;

  views.sahel.zoom = 3.55;
  views.sahel.pitch = 38;

  views.china.zoom = 3.65;
  views.china.pitch = 38;
}

/* =========================================================
   Story text
   ========================================================= */

/* Names for the summary panel. These label a place, where storyText
   titles make an argument about it - the panel needs the former, and
   reusing the latter had it echo the story heading word for word. */

const regionLabels = {
  global: "Global overview",
  amazon: "Amazon Basin",
  sahel: "Sahel and West Africa",
  china: "Northern China"
};

const storyText = {
  global: {
    title: "A Greener Global Picture",
    text:
      "Many parts of the world appear greener in 2025 than they did in 2000. This encouraging pattern suggests that vegetation can recover through natural processes, rainfall changes, improved land management, and environmental restoration. However, progress is uneven, so regional details remain important. Explore the globe to see where greening is occurring and what these changes may teach us about building a more sustainable future."
  },

  amazon: {
    title: "Amazon Basin",
    text:
      "The Amazon remains one of the most vegetation-dense regions in the world, and much of the basin continues to show high NDVI. Areas of growth demonstrate the forest’s resilience and capacity for recovery. However, concentrated orange areas also reveal vegetation decline near deforestation frontiers affected by roads, ranching, farming, and settlement. Therefore, protecting existing forest while restoring cleared land remains essential to preserving the Amazon’s ecological value."
  },

  sahel: {
    title: "Sahel / West Africa",
    text:
      "The Sahel offers an encouraging example of vegetation recovery. Average NDVI rises from about 0.391 in 2000 to 0.405 in 2025, and the chart shows more growth cells than decline cells. Increased rainfall, local land management, and restoration efforts may all contribute to this greening. However, drought, grazing pressure, farming expansion, and land degradation continue to affect some areas. Therefore, the Sahel represents both meaningful progress and an opportunity for continued restoration."
  },

  china: {
    title: "Northern China / Inner Mongolia",
    text:
      "Northern China and Inner Mongolia show one of the strongest greening signals in the project. Average NDVI rises from about 0.296 in 2000 to 0.409 in 2025, and nearly all changed cells show vegetation growth. Large restoration and anti-desertification programs may have contributed to this improvement. However, water limitations, grazing pressure, and climate variability still create local challenges. Therefore, the region shows how coordinated environmental action can produce visible progress while requiring careful long-term management."
  }
};

/* =========================================================
   Guided tour
   ========================================================= */

const tourSteps = [
  {
    title: "We Expect Decline",
    text:
      "Human activity has transformed forests, grasslands, farms, and drylands around the world. Many people may expect these pressures to have caused vegetation to decline almost everywhere.",
    mode: "present",
    view: "global"
  },

  {
    title: "The Big Picture",
    text:
      "MODIS satellite data reveals a more encouraging global pattern. Many parts of the world appear greener in 2025 than they did in 2000, showing that vegetation can recover, expand, or respond positively to changing conditions.",
    mode: "change",
    view: "global"
  },

  {
    title: "Different Forms of Progress",
    text:
      "Vegetation growth can result from forest recovery, increased rainfall, improved farming, better land management, or large restoration programs. But the pattern is not identical everywhere, so the meaning of greening depends on the region.",
    mode: "change",
    view: "amazon"
  },

  {
    title: "Strong Recoveries",
    text:
      "The Sahel shows signs of recovery after severe historical droughts. There are large parts of Africa that show no growth or loss, due to these areas being deserts. Northern China shows strong greening near major restoration projects. Even in the Amazon, areas of growth exist alongside places that still need protection.",
    mode: "change",
    view: "sahel",
    openChart: true
  },

  {
    title: "A Hopeful Future",
    text:
      "The global trend offers reasons for optimism, while regional differences show where continued restoration and protection are needed. Environmental improvement is possible, and human choices can help shape a greener future.",
    mode: "compare",
    view: "global"
  }
];

/* =========================================================
   Geographic bounds
   ========================================================= */

const regionBounds = {
  global: [-180, 180, -60, 85],
  amazon: [-80, -45, -20, 10],
  sahel: [-20, 35, 5, 20],
  china: [95, 125, 35, 47]
};

/* =========================================================
   Data files
   ========================================================= */

/*
  Datasets are named, not pathed. grid.js resolves a (dataset, detail) pair to
  a file through data/grid/manifest.json.
*/
const spikeDatasets = ["2000", "2013", "2025"];

const changeDataset = "change";

const emptyGeoJSON = {
  type: "FeatureCollection",
  features: []
};

/* =========================================================
   State
   ========================================================= */

const chartStatsCache = {};

let previousNdviBarWidths = {
  "2000": 0,
  "2013": 0,
  "2025": 0
};

/* Where the four headline figures were left by the last
   region, so the next one can count from there rather than
   being replaced between frames. Keyed by the data-figure
   attribute the markup carries. */
let previousChartFigures = {};

let currentMode = "present";
let activeView = "global";
let compareBaseYear = "2000";
let currentTourStep = 0;
let splashStage = 0;

let syncing = false;
let isLoadingDetail = false;
let appReady = false;

let activeDetail = {
  present: "low",
  compare: null,
  change: null
};

/*
  What is currently on each map, as "dataset(s)@detail". Each map holds the
  whole globe, so this only changes when the detail level or the dataset does -
  never on a pan.
*/
let activeDataSignature = {
  present: "",
  compare: "",
  change: ""
};

/* =========================================================
   Map creation
   ========================================================= */

const mapOptions = {
  style: "mapbox://styles/mapbox/light-v11",
  center: views.global.center,
  zoom: views.global.zoom,
  pitch: views.global.pitch,
  bearing: views.global.bearing,
  projection: "globe",
  renderWorldCopies: false,
  antialias: false,
  attributionControl: true
};

const singleMap = new mapboxgl.Map({
  container: "single-map",
  ...mapOptions
});

/* Compare mode shows two maps on one page, and each was drawing its
   own attribution bar and Mapbox logo - the page ended up with the
   same credit twice. One set covers the view, so the left map goes
   without and the right map carries it for both. */

const leftMap = new mapboxgl.Map({
  container: "left-map",
  ...mapOptions,
  attributionControl: false
});

const rightMap = new mapboxgl.Map({
  container: "right-map",
  ...mapOptions
});

singleMap.addControl(
  new mapboxgl.NavigationControl({
    visualizePitch: true
  }),
  "top-right"
);

rightMap.addControl(
  new mapboxgl.NavigationControl({
    visualizePitch: true
  }),
  "bottom-right"
);

const maps = [singleMap, leftMap, rightMap];

setupSplashScreen();

Promise.all(maps.map(waitForMapLoad))
  .then(initAllMaps)
  .catch(error => {
    console.error("Map initialization failed:", error);
    updateSplashStatus("The map could not be loaded.");
  });

/* =========================================================
   Globe configuration
   ========================================================= */

function setupGlobe(map) {
  map.setProjection("globe");

  if (map.setFog) {
    map.setFog(null);
  }

  if (map.setLight) {
    map.setLight({
      anchor: "viewport",
      color: "#ffffff",
      intensity: 0
    });
  }
}

/*
  Change mode draws growth and decline over bare land, and light-v11's
  landmass is near-white - the spikes are semi-transparent, so they were
  landing on a ground almost as bright as they are and the view carrying
  the project's whole argument became its least readable screen. Dark
  theme never had the problem because its scrim already pulls the land
  down.

  Grading the `land` background layer fixes it where the problem is. The
  first attempt was a full-viewport multiply overlay, which did darken
  the land but greyed the page around the globe with it - it changed the
  character of the whole screen to fix one layer of it.

  Present and compare modes cover the land with spikes almost edge to
  edge, so they keep the original light ground.
*/

const LAND_GRADE_CHANGE = "#6c756f";

let landOriginalPaint = null;

/*
  Place labels were tuned by Mapbox against a near-white ground. Once the
  land is graded down they become the highest-contrast thing on the globe
  and start competing with the data they are supposed to sit behind, so
  they settle back by the same amount the land moves.
*/
const LABEL_OPACITY_CHANGE = 0.45;

function labelLayerIds(map) {
  const style = map.getStyle();

  if (!style || !Array.isArray(style.layers)) {
    return [];
  }

  return style.layers
    .filter(layer => layer.type === "symbol")
    .map(layer => layer.id);
}

function setLandGrade(map, graded) {
  if (!map.getLayer("land")) {
    return;
  }

  /* Captured once, from whichever map reports first - all three load
     the same style, so one snapshot restores any of them. */
  if (landOriginalPaint === null) {
    landOriginalPaint =
      map.getPaintProperty("land", "background-color") ?? null;
  }

  try {
    map.setPaintProperty(
      "land",
      "background-color",
      graded ? LAND_GRADE_CHANGE : landOriginalPaint
    );
  } catch (error) {
    /* A style reload can land mid-call; the next setMode fixes it. */
  }

  labelLayerIds(map).forEach(id => {
    try {
      map.setPaintProperty(
        id,
        "text-opacity",
        graded ? LABEL_OPACITY_CHANGE : 1
      );
    } catch (error) {
      /* Not every symbol layer draws text. */
    }
  });
}

function setDarkOcean(map) {
  const style = map.getStyle();

  if (!style || !Array.isArray(style.layers)) {
    return;
  }

  style.layers.forEach(layer => {
    const layerId = layer.id.toLowerCase();

    const isWaterFill =
      layer.type === "fill" &&
      (
        layerId === "water" ||
        layerId.includes("water") ||
        layerId.includes("ocean") ||
        layerId.includes("lake")
      );

    const isWaterLine =
      layer.type === "line" &&
      (
        layerId.includes("waterway") ||
        layerId.includes("river") ||
        layerId.includes("stream") ||
        layerId.includes("canal")
      );

    if (isWaterFill) {
      try {
        map.setPaintProperty(
          layer.id,
          "fill-color",
          "#12303b"
        );

        map.setPaintProperty(
          layer.id,
          "fill-opacity",
          1
        );
      } catch (error) {
        console.warn(
          `Could not recolor water layer "${layer.id}".`,
          error
        );
      }
    }

    if (isWaterLine) {
      try {
        map.setPaintProperty(
          layer.id,
          "line-color",
          "#1b4554"
        );

        map.setPaintProperty(
          layer.id,
          "line-opacity",
          0.9
        );
      } catch (error) {
        console.warn(
          `Could not recolor waterway layer "${layer.id}".`,
          error
        );
      }
    }
  });
}

function waitForMapLoad(map) {
  return new Promise(resolve => {
    if (map.loaded()) {
      resolve(map);
      return;
    }

    map.once("load", () => resolve(map));
  });
}

/* =========================================================
   Initialization
   ========================================================= */

async function initAllMaps() {
  setupGlobe(singleMap);
  setupGlobe(leftMap);
  setupGlobe(rightMap);

  setDarkOcean(singleMap);
  setDarkOcean(leftMap);
  setDarkOcean(rightMap);

  singleMap.once("idle", () => {
    setDarkOcean(singleMap);
  });

  leftMap.once("idle", () => {
    setDarkOcean(leftMap);
  });

  rightMap.once("idle", () => {
    setDarkOcean(rightMap);
  });

  updateSplashStatus("Loading 2025 vegetation layer...");

  setupMapLayer(singleMap, emptyGeoJSON, "present");
  setupMapLayer(leftMap, emptyGeoJSON, "compare");
  setupMapLayer(rightMap, emptyGeoJSON, "compare");

  addChangeLayerToSingleMap(emptyGeoJSON);

  setupTopTabs();
  setupCompareYearSwitch();
  setupRegionJump();
  setupThemeSwitcher();
  setupMobileChartToggle();
  setupAboutModal();
  setupGuidedTour();
  setupTakeawayPanel();
  setupPopup(singleMap);
  setupPopup(leftMap);
  setupPopup(rightMap);
  syncCompareMaps();
  setupDetailSwitching();

  updateStoryPanel("global");
  updateRegionCharts("global");

  document.body.classList.remove(
    "mode-compare",
    "mode-change"
  );

  document.body.classList.add("mode-present");

  currentMode = "present";
  activeView = "global";

  jumpMapTo(singleMap, views.global);
  jumpMapTo(leftMap, views.global);
  jumpMapTo(rightMap, views.global);

  resizeMaps();

  /* Camera is in place, so the visible tiles are now known. */
  await refreshVisibleData(true);

  preloadLikelyNextFiles();

  appReady = true;

  enableStartButton();
}

/* =========================================================
   Theme
   ========================================================= */

/* Theme is a preference, not one of the three primary modes, so it
   reads as a single control beside the brand rather than a labelled
   dropdown sitting at the same weight as the mode nav. One button
   cycling auto -> light -> dark: three states is short enough that
   cycling stays predictable, and the button always names the state
   it is currently in. */

const themeOrder = [
  "auto",
  "light",
  "dark"
];

const themeLabels = {
  auto: "Auto",
  light: "Light",
  dark: "Dark"
};

function setupThemeSwitcher() {
  const toggle = document.querySelector("#theme-toggle");

  if (!toggle) {
    return;
  }

  const labels =
    toggle.querySelectorAll(".theme-toggle-label");

  let current =
    localStorage.getItem("theme-preference") || "auto";

  function applyTheme(next) {
    current = next;

    document.documentElement.dataset.theme = next;

    localStorage.setItem(
      "theme-preference",
      next
    );

    labels.forEach(label => {
      label.textContent = themeLabels[next];
    });

    toggle.dataset.theme = next;

    /* The visible label only says the current state, so the
       accessible name has to carry what pressing it will do. */
    toggle.setAttribute(
      "aria-label",
      `Theme: ${themeLabels[next]}. Switch to ${
        themeLabels[nextTheme(next)]
      }.`
    );
  }

  function nextTheme(from) {
    const index = themeOrder.indexOf(from);

    return themeOrder[
      (index + 1) % themeOrder.length
    ];
  }

  applyTheme(
    themeOrder.includes(current) ? current : "auto"
  );

  toggle.addEventListener("click", () => {
    applyTheme(nextTheme(current));
  });
}

/* =========================================================
   Data loading
   ========================================================= */

/*
  Warm the medium grids, which the region charts need and which a first zoom
  is likely to want. These are ~0.7 MB each now, so this costs about as much
  as a photograph.
*/
function preloadLikelyNextFiles() {
  window.setTimeout(() => {
    spikeDatasets.forEach(year => {
      loadGrid(year, "medium").catch(console.error);
    });

    loadGrid(changeDataset, "medium")
      .catch(console.error);

    /*
      Build the collection a first zoom-in will land on, while the browser is
      otherwise idle, so crossing the detail threshold does not have to pay for
      it. Only the one the user is most likely to hit - building all of them
      would blow past the cache budget and evict what is on screen.
    */
    const buildAhead = () => {
      globeCollection("2025", "medium")
        .catch(console.error);
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(buildAhead, {
        timeout: 4000
      });
    } else {
      window.setTimeout(buildAhead, 2500);
    }
  }, 1500);
}

async function applyDatasetToMap(
  map,
  sourceId,
  dataset,
  detail
) {
  const collection = await globeCollection(
    dataset,
    detail
  );

  const source = map.getSource(sourceId);

  if (source) {
    source.setData(collection);
  }

  return collection;
}

/* =========================================================
   Map layers
   ========================================================= */

function setupMapLayer(map, data, mode) {
  if (!map.getSource("spikes")) {
    map.addSource("spikes", {
      type: "geojson",
      data
    });
  }

  if (!map.getLayer("spikes-layer")) {
    map.addLayer({
      id: "spikes-layer",
      type: "fill-extrusion",
      source: "spikes",
      paint: getSpikePaint(mode)
    });
  }
}

function addChangeLayerToSingleMap(data) {
  if (!singleMap.getSource("change-spikes")) {
    singleMap.addSource("change-spikes", {
      type: "geojson",
      data
    });
  }

  if (!singleMap.getLayer("change-spikes-layer")) {
    singleMap.addLayer({
      id: "change-spikes-layer",
      type: "fill-extrusion",
      source: "change-spikes",
      layout: {
        visibility: "none"
      },
      paint: getChangePaint()
    });
  }
}

function getSpikePaint(mode) {
  return {
    "fill-extrusion-color": [
      "interpolate",
      ["linear"],
      ["get", "greenness"],

      0,
      "#efe7d3",

      0.1,
      "#dccca3",

      0.22,
      "#c8d18f",

      0.38,
      "#96c975",

      0.55,
      "#4fb66f",

      0.72,
      "#159978",

      0.88,
      "#006f7f",

      1,
      "#103f91"
    ],

    "fill-extrusion-height": [
      "coalesce",
      ["get", "height"],
      0
    ],

    "fill-extrusion-base": 0,

    "fill-extrusion-opacity":
      mode === "compare" ? 0.65 : 0.92,

    "fill-extrusion-vertical-gradient": false,
    "fill-extrusion-emissive-strength": 1,
    "fill-extrusion-ambient-occlusion-intensity": 0,
    "fill-extrusion-ambient-occlusion-radius": 0
  };
}

/* Cells the pipeline found no measurable change in - see buildChangeFeatures()
   in grid.js - are drawn as flat grey plates rather than spikes.

   The shortest real spike is exactly CHANGE_THRESHOLD * 320000 (8,000 m), so
   anything under that is already unambiguous. This is set far lower - at the
   same 300 m floor ndvi_to_height() uses - because the plates are wide and
   pale, and a wide pale top face reads as taller than it is. Below roughly
   this point the extrusion contributes nothing visible either way, and the
   blocks are carried by STILL_COLOR alone. */
const STILL_COLOR = "#e2e2d8";
const STILL_HEIGHT = 300;

function getChangePaint() {
  return {
    "fill-extrusion-color": [
      "case",
      ["==", ["get", "still"], 1],
      STILL_COLOR,

      [">", ["get", "change"], 0],
      "#2ca25f",

      "#e76f51"
    ],

    "fill-extrusion-height": [
      "case",
      ["==", ["get", "still"], 1],
      STILL_HEIGHT,

      [
        "min",
        [
          "*",
          ["abs", ["get", "change"]],
          320000
        ],
        65000
      ]
    ],

    "fill-extrusion-base": 0,
    "fill-extrusion-opacity": 0.72,
    "fill-extrusion-vertical-gradient": false,
    "fill-extrusion-emissive-strength": 1,
    "fill-extrusion-ambient-occlusion-intensity": 0,
    "fill-extrusion-ambient-occlusion-radius": 0
  };
}

/* =========================================================
   Detail level
   ========================================================= */

function detailFromZoom(zoom, viewName = activeView) {
  if (zoom >= 5.3) {
    return "high";
  }

  if (viewName !== "global") {
    if (zoom >= 4.8) {
      return "high";
    }

    return "medium";
  }

  if (zoom >= 3.2) {
    return "medium";
  }

  return "low";
}

function changeDetailFromZoom(zoom, viewName = activeView) {
  if (viewName === "global") {
    if (zoom >= 5.3) {
      return "high";
    }

    if (zoom >= 3.2) {
      return "medium";
    }

    return "low";
  }

  return "high";
}

function debounce(func, wait) {
  let timeout;

  return function debouncedFunction(...args) {
    window.clearTimeout(timeout);

    timeout = window.setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

/*
  The detail level follows the camera's zoom. `moveend` covers zooming as well
  as panning; a pan leaves the signature unchanged, so refreshVisibleData()
  returns immediately and panning stays free.
*/
function setupDetailSwitching() {
  const handleSingleMove = debounce(() => {
    if (
      currentMode === "present" ||
      currentMode === "change"
    ) {
      refreshVisibleData();
    }
  }, 250);

  const handleCompareMove = debounce(() => {
    if (currentMode === "compare") {
      refreshVisibleData();
    }
  }, 250);

  singleMap.on("moveend", handleSingleMove);
  leftMap.on("moveend", handleCompareMove);
  rightMap.on("moveend", handleCompareMove);
}

/*
  Bring the active mode's maps in line with the current camera.

  Each map holds the whole globe, so this is a no-op for panning: only a change
  of detail level (or of which dataset feeds a map) produces new work. That is
  the whole point - setData() reprocesses an entire source, so it must not be
  on the pan path.
*/
async function refreshVisibleData(force = false) {
  if (isLoadingDetail) {
    return;
  }

  const referenceMap =
    currentMode === "compare" ? leftMap : singleMap;

  const camera = getCurrentCamera(referenceMap);

  if (!camera) {
    return;
  }

  const detail =
    currentMode === "change"
      ? changeDetailFromZoom(camera.zoom, activeView)
      : detailFromZoom(camera.zoom, activeView);

  const signature =
    currentMode === "compare"
      ? `${compareBaseYear}+2025@${detail}`
      : currentMode === "change"
        ? `change@${detail}`
        : `2025@${detail}`;

  if (
    !force &&
    signature === activeDataSignature[currentMode]
  ) {
    return;
  }

  isLoadingDetail = true;

  try {
    if (currentMode === "present") {
      await applyDatasetToMap(
        singleMap,
        "spikes",
        "2025",
        detail
      );
    }

    if (currentMode === "compare") {
      await Promise.all([
        applyDatasetToMap(
          leftMap,
          "spikes",
          compareBaseYear,
          detail
        ),

        applyDatasetToMap(
          rightMap,
          "spikes",
          "2025",
          detail
        )
      ]);
    }

    if (currentMode === "change") {
      await applyDatasetToMap(
        singleMap,
        "change-spikes",
        changeDataset,
        detail
      );
    }

    activeDetail[currentMode] = detail;
    activeDataSignature[currentMode] = signature;
  } catch (error) {
    console.error(
      "Unable to refresh map data:",
      error
    );
  } finally {
    isLoadingDetail = false;
  }
}

/* =========================================================
   Mode controls
   ========================================================= */

function setupTopTabs() {
  const tabs =
    document.querySelectorAll(".compare-tab");

  tabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      tabs.forEach(item => {
        item.classList.remove("selected");
      });

      tab.classList.add("selected");

      closeMobileChart();

      await setMode(tab.dataset.mode);
    });
  });
}

function setupCompareYearSwitch() {
  const buttons =
    document.querySelectorAll(".compare-year-option");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      buttons.forEach(item => {
        item.classList.remove("selected");
      });

      button.classList.add("selected");

      compareBaseYear =
        button.dataset.compareYear;

      if (currentMode !== "compare") {
        return;
      }

      /* The left map now shows a different year over the same tiles. */
      await refreshVisibleData(true);
    });
  });
}

function getVisibleCamera() {
  if (currentMode === "compare") {
    return getCurrentCamera(leftMap);
  }

  return getCurrentCamera(singleMap);
}

function clearCompareMaps() {
  const leftSource =
    leftMap.getSource("spikes");

  const rightSource =
    rightMap.getSource("spikes");

  if (leftSource) {
    leftSource.setData(emptyGeoJSON);
  }

  if (rightSource) {
    rightSource.setData(emptyGeoJSON);
  }

  activeDetail.compare = null;
  activeDataSignature.compare = "";
}

/* =========================================================
   Spike layer swap

   Present and change are the same globe read two different
   ways, and switching between them repaints every feature on
   the planet. Toggling layout visibility does that inside a
   single frame, which reads as a glitch rather than as a
   change of subject - the one hard cut left in an app whose
   intro is built entirely out of soft ones.

   Mapbox interpolates paint properties itself, so the swap is
   handed to it. The outgoing layer leaves first and quickly;
   the incoming one is staged at zero opacity, sits there while
   its data is built, and only then eases up. Staging before
   the build is the point - fade in a layer that has no data
   yet and the features pop in at full strength afterwards,
   which is the hard cut again with extra steps.

   Layout visibility still does the real hiding. It just waits
   until the fade covering it has finished, so nothing is
   rendered that cannot be seen.
   ========================================================= */

const SPIKE_FADE_OUT_MS = 220;
const SPIKE_FADE_IN_MS = 340;

/* The two fades overlap by this much, so the globe is never
   completely stripped between them. Small on purpose: these
   are different measurements, not two states of one thing,
   and a long dissolve would read as a blend of the two. */
const SPIKE_FADE_OVERLAP_MS = 90;

const SPIKE_OPACITY = {
  "spikes-layer": 0.92,
  "change-spikes-layer": 0.72
};

/* Bumped on every mode change. A fade-out that finishes after
   a newer switch has already re-shown the same layer must not
   be the thing that hides it. */
let spikeSwapToken = 0;

function setSpikeOpacity(
  map,
  layerId,
  value,
  duration
) {
  if (
    !map ||
    !map.getLayer(layerId)
  ) {
    return;
  }

  map.setPaintProperty(
    layerId,
    "fill-extrusion-opacity-transition",
    {
      duration,
      delay: 0
    }
  );

  map.setPaintProperty(
    layerId,
    "fill-extrusion-opacity",
    value
  );
}

/* Hides one layer and stages the other. Returns nothing the
   caller waits on: the outgoing fade runs over the data build
   that follows it, which is the whole reason it is here. */

function beginSpikeSwap(
  map,
  outgoingLayer,
  incomingLayer,
  animate,
  token
) {
  const target =
    SPIKE_OPACITY[incomingLayer];

  if (
    !animate ||
    prefersReducedMotion()
  ) {
    if (map.getLayer(outgoingLayer)) {
      map.setLayoutProperty(
        outgoingLayer,
        "visibility",
        "none"
      );
    }

    if (map.getLayer(incomingLayer)) {
      map.setLayoutProperty(
        incomingLayer,
        "visibility",
        "visible"
      );

      setSpikeOpacity(
        map,
        incomingLayer,
        target,
        0
      );
    }

    return;
  }

  setSpikeOpacity(
    map,
    outgoingLayer,
    0,
    SPIKE_FADE_OUT_MS
  );

  window.setTimeout(
    () => {
      if (
        token !== spikeSwapToken ||
        !map.getLayer(outgoingLayer)
      ) {
        return;
      }

      map.setLayoutProperty(
        outgoingLayer,
        "visibility",
        "none"
      );
    },
    SPIKE_FADE_OUT_MS
  );

  /* Visible but at zero, with no transition to get there, so
     the data arriving underneath is invisible until released. */
  if (map.getLayer(incomingLayer)) {
    setSpikeOpacity(
      map,
      incomingLayer,
      0,
      0
    );

    map.setLayoutProperty(
      incomingLayer,
      "visibility",
      "visible"
    );
  }
}

/* Called once the incoming layer actually has something to
   show. If the build outran the outgoing fade, hold back the
   remainder of it so the two still overlap rather than the
   new spikes landing on a bare globe. */

function revealSpikes(
  map,
  layerId,
  startedAt,
  token
) {
  if (
    token !== spikeSwapToken ||
    !map ||
    !map.getLayer(layerId)
  ) {
    return;
  }

  const target =
    SPIKE_OPACITY[layerId];

  if (prefersReducedMotion()) {
    setSpikeOpacity(
      map,
      layerId,
      target,
      0
    );

    return;
  }

  const elapsed =
    performance.now() - startedAt;

  const hold = Math.max(
    0,
    SPIKE_FADE_OUT_MS - SPIKE_FADE_OVERLAP_MS - elapsed
  );

  window.setTimeout(
    () => {
      if (token !== spikeSwapToken) {
        return;
      }

      setSpikeOpacity(
        map,
        layerId,
        target,
        SPIKE_FADE_IN_MS
      );
    },
    hold
  );
}

async function setMode(mode) {
  const previousCamera =
    getVisibleCamera() || views.global;

  /* Only present and change share a globe. Every other switch
     moves between two different map containers, and the
     containers crossfade in CSS. */
  const swapsSpikes =
    (currentMode === "present" && mode === "change") ||
    (currentMode === "change" && mode === "present");

  const swapToken = ++spikeSwapToken;
  const swapStartedAt = performance.now();

  currentMode = mode;

  document.body.classList.remove(
    "mode-compare",
    "mode-present",
    "mode-change"
  );

  document.body.classList.add(
    `mode-${mode}`
  );

  setLandGrade(
    singleMap,
    mode === "change"
  );

  /*
    Camera first, data second: which tiles get built depends on where the
    camera ends up, so every branch below positions the maps and then lets
    refreshVisibleData() fill them.
  */
  if (mode === "compare") {
    closeMobileChart();

    if (leftMap.getLayer("spikes-layer")) {
      leftMap.setPaintProperty(
        "spikes-layer",
        "fill-extrusion-opacity",
        0.65
      );
    }

    if (rightMap.getLayer("spikes-layer")) {
      rightMap.setPaintProperty(
        "spikes-layer",
        "fill-extrusion-opacity",
        0.65
      );
    }

    jumpMapTo(leftMap, previousCamera);
    jumpMapTo(rightMap, previousCamera);
  }

  if (mode === "present") {
    clearCompareMaps();

    beginSpikeSwap(
      singleMap,
      "change-spikes-layer",
      "spikes-layer",
      swapsSpikes,
      swapToken
    );

    if (activeView === "global") {
      jumpMapTo(singleMap, views.global);
    } else {
      jumpMapTo(singleMap, previousCamera);
    }
  }

  if (mode === "change") {
    clearCompareMaps();

    beginSpikeSwap(
      singleMap,
      "spikes-layer",
      "change-spikes-layer",
      swapsSpikes,
      swapToken
    );

    if (activeView === "global") {
      jumpMapTo(singleMap, views.global);
    } else {
      jumpMapTo(singleMap, previousCamera);
    }
  }

  resizeMaps();

  await refreshVisibleData(true);

  /* The staged layer now has its data, so let it up. */
  if (swapsSpikes) {
    revealSpikes(
      singleMap,
      mode === "change"
        ? "change-spikes-layer"
        : "spikes-layer",
      swapStartedAt,
      swapToken
    );
  }
}

/* =========================================================
   Region controls
   ========================================================= */

function setupRegionJump() {
  const jump =
    document.querySelector(".region-jump");

  const trigger =
    document.querySelector("#region-trigger");

  const options =
    document.querySelectorAll(".region-option");

  if (
    !jump ||
    !trigger ||
    !options.length
  ) {
    return;
  }

  function closeRegionJump() {
    jump.classList.remove("open");

    trigger.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function openRegionJump() {
    jump.classList.add("open");

    trigger.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  trigger.addEventListener("click", () => {
    if (jump.classList.contains("open")) {
      closeRegionJump();
    } else {
      openRegionJump();
    }
  });

  options.forEach(option => {
    option.addEventListener("click", async () => {
      const viewName = option.dataset.region;

      closeRegionJump();

      if (viewName === activeView) {
        return;
      }

      syncRegionControl(viewName);

      activeView = viewName;

      updateStoryPanel(viewName);
      closeMobileChart();

      await Promise.all([
        updateRegionCharts(viewName),
        flyAllTo(viewName)
      ]);
    });
  });

  /* Closes on any click outside the control, and on Escape from
     anywhere - the accordion floats over the map with nothing
     else to catch focus, so both are the only ways out besides
     picking an option. */

  document.addEventListener("click", event => {
    if (!jump.contains(event.target)) {
      closeRegionJump();
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      jump.classList.contains("open")
    ) {
      closeRegionJump();
      trigger.focus();
    }
  });
}

/* Keeps the trigger label and the option list's selected state
   in sync with activeView, without the side effects a real
   selection triggers - used when something else (the splash
   reset, the tour) moves the region under the control's feet. */

function syncRegionControl(viewName) {
  const label =
    document.querySelector("#region-trigger-label");

  if (label) {
    label.textContent =
      regionLabels[viewName] || regionLabels.global;
  }

  document
    .querySelectorAll(".region-option")
    .forEach(option => {
      const selected =
        option.dataset.region === viewName;

      option.classList.toggle(
        "selected",
        selected
      );

      option.setAttribute(
        "aria-selected",
        selected ? "true" : "false"
      );
    });
}

/* Matches the exit half of .story-piece in the stylesheet.
   Same shape as TOUR_EXIT_MS, and for the same reason: a
   transition that never starts never fires transitionend, so
   the swap is timed rather than listened for. */
const STORY_EXIT_MS = 170;

let storyExitTimer = 0;

/* Not awaited by anything. The copy leaves, the words are
   replaced while nothing is on screen to see it happen, and
   the new ones rise - all of it running alongside the camera
   flight the same click started. */

function updateStoryPanel(viewName) {
  const story = storyText[viewName];

  if (!story) {
    return;
  }

  const panel =
    document.querySelector(".story-panel");

  const title =
    document.querySelector("#story-title");

  const text =
    document.querySelector("#story-text");

  if (
    !title ||
    !text
  ) {
    return;
  }

  /* Consecutive tour steps can share a region, and the first
     call of all restates what the markup already says. Neither
     is a change, so neither gets played as one. */
  if (title.textContent.trim() === story.title) {
    return;
  }

  function swap() {
    title.textContent = story.title;
    text.textContent = story.text;
  }

  /* Nothing to clear on first paint, and nothing to play
     against while the panel is hidden behind the tour or in
     compare mode. */
  const unseen =
    !panel ||
    document.body.classList.contains("tour-open") ||
    currentMode === "compare";

  if (unseen) {
    swap();

    if (panel) {
      panel.dataset.phase = "in";
    }

    return;
  }

  window.clearTimeout(storyExitTimer);

  panel.dataset.phase = "exit";

  storyExitTimer = window.setTimeout(
    () => {
      swap();

      panel.dataset.phase = "enter";

      /* Commit the staged state before releasing it. Setting
         both in one go collapses them into no transition at
         all; a forced reflow flushes style synchronously and,
         unlike rAF, is not throttled away in a background
         tab. Same technique as playTourTextEnter(). */
      void panel.offsetHeight;

      panel.dataset.phase = "in";
    },
    prefersReducedMotion()
      ? 0
      : STORY_EXIT_MS
  );
}

async function flyAllTo(viewName) {
  const view = views[viewName];

  if (!view) {
    return;
  }

  /*
    No explicit reload here: setupDetailSwitching() listens for moveend on
    every map, so the flight's arrival triggers the refresh.
  */
  if (currentMode === "compare") {
    mapFlyTo(leftMap, view);
    mapFlyTo(rightMap, view);
  } else {
    mapFlyTo(singleMap, view);
  }
}

function mapFlyTo(map, view) {
  map.flyTo({
    center: view.center,
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    offset: view.offset || [0, 0],

    /* Carried by the flight instead of eased separately. Two camera
       animations on one map do not blend - the later one cancels the
       earlier, and which one wins depends on how long the flight is
       still running, so a standalone easeTo() for the padding was
       silently dropped on every step that also moved. Reframing is
       part of the move, so it travels with it. */
    padding: tourFramingPadding(map),
    duration: 2800,
    speed: 0.45,
    curve: 1.45,
    essential: true
  });
}

function jumpMapTo(map, view) {
  if (!map || !view) {
    return;
  }

  map.jumpTo({
    center: view.center,
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    offset: view.offset || [0, 0],
    padding: tourFramingPadding(map)
  });
}

function getCurrentCamera(map) {
  if (!map) {
    return null;
  }

  const center = map.getCenter();

  return {
    center: [
      center.lng,
      center.lat
    ],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    offset: [0, 0]
  };
}

/* =========================================================
   Compare synchronization
   ========================================================= */

function syncCompareMaps() {
  let activeMovingMap = null;

  function createSyncHandler(
    sourceMap,
    targetMap
  ) {
    return () => {
      if (
        currentMode !== "compare" ||
        syncing
      ) {
        return;
      }

      if (
        activeMovingMap &&
        activeMovingMap !== sourceMap
      ) {
        return;
      }

      syncing = true;
      activeMovingMap = sourceMap;

      targetMap.jumpTo({
        center: sourceMap.getCenter(),
        zoom: sourceMap.getZoom(),
        bearing: sourceMap.getBearing(),
        pitch: sourceMap.getPitch()
      });

      requestAnimationFrame(() => {
        syncing = false;
      });
    };
  }

  const onLeftMove =
    createSyncHandler(
      leftMap,
      rightMap
    );

  const onRightMove =
    createSyncHandler(
      rightMap,
      leftMap
    );

  leftMap.on("move", onLeftMove);
  rightMap.on("move", onRightMove);

  const clearActiveMap = () => {
    activeMovingMap = null;
  };

  maps.forEach(map => {
    map.on("moveend", clearActiveMap);
    map.on("mouseup", clearActiveMap);
    map.on("touchend", clearActiveMap);
  });
}

/* =========================================================
   Popups
   ========================================================= */

function cellKey(feature) {
  const ring =
    feature.geometry?.coordinates?.[0];

  if (!ring || !ring.length) {
    return "";
  }

  let longitudeSum = 0;
  let latitudeSum = 0;

  ring.forEach(coordinate => {
    longitudeSum += coordinate[0];
    latitudeSum += coordinate[1];
  });

  const longitude =
    longitudeSum / ring.length;

  const latitude =
    latitudeSum / ring.length;

  return [
    Math.round(longitude * 1000),
    Math.round(latitude * 1000)
  ].join(",");
}

function setupPopup(map) {
  if (map.__popupReady) {
    return;
  }

  map.__popupReady = true;

  const popup =
    new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    });

  let lastHoveredId = null;

  map.on(
    "mousemove",
    "spikes-layer",
    event => {
      if (!event.features?.length) {
        return;
      }

      const feature =
        event.features[0];

      const currentId =
        cellKey(feature);

      if (currentId === lastHoveredId) {
        return;
      }

      lastHoveredId = currentId;

      const properties =
        feature.properties || {};

      map.getCanvas().style.cursor =
        "pointer";

      const ndvi =
        Number(properties.ndvi);

      const greenness =
        Number(properties.greenness);

      const height =
        Number(properties.height);

      const ndviText =
        Number.isFinite(ndvi)
          ? `Actual NDVI: ${ndvi.toFixed(3)}`
          : `Greenness: ${
              Number.isFinite(greenness)
                ? greenness.toFixed(3)
                : "N/A"
            }`;

      popup
        .setLngLat(event.lngLat)
        .setHTML(`
          <strong>Vegetation intensity</strong><br>
          ${ndviText}<br>
          Height: ${
            Number.isFinite(height)
              ? Math.round(height)
              : "N/A"
          }
        `)
        .addTo(map);
    }
  );

  map.on(
    "mouseleave",
    "spikes-layer",
    () => {
      lastHoveredId = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    }
  );

  if (map !== singleMap) {
    return;
  }

  map.on(
    "mousemove",
    "change-spikes-layer",
    event => {
      if (!event.features?.length) {
        return;
      }

      const feature =
        event.features[0];

      const currentId =
        cellKey(feature);

      if (currentId === lastHoveredId) {
        return;
      }

      lastHoveredId = currentId;

      const change = Number(
        feature.properties?.change
      );

      map.getCanvas().style.cursor =
        "pointer";

      popup
        .setLngLat(event.lngLat)
        .setHTML(`
          <strong>NDVI Change, 2000–2025</strong><br>
          ${
            feature.properties?.still
              ? "No measurable change"
              : `${
                  change > 0
                    ? "Growth"
                    : "Decline"
                }: ${
                  Number.isFinite(change)
                    ? change.toFixed(3)
                    : "N/A"
                }`
          }
        `)
        .addTo(map);
    }
  );

  map.on(
    "mouseleave",
    "change-spikes-layer",
    () => {
      lastHoveredId = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    }
  );
}

/* =========================================================
   Map resizing
   ========================================================= */

function resizeMaps() {
  requestAnimationFrame(() => {
    maps.forEach(map => {
      map.resize();
    });
  });

  window.setTimeout(() => {
    maps.forEach(map => {
      map.resize();
    });
  }, 250);
}

window.addEventListener(
  "resize",
  debounce(resizeMaps, 150)
);

/* =========================================================
   Chart calculations
   ========================================================= */

/*
  Cell geometry used to be recovered from each feature's polygon ring. The grid
  knows it directly, so featureCenter / pointInBounds / polygonAreaKm2 /
  featureAreaKm2 are gone - see gridMeanNdvi() and gridChangeTotals().
*/

function formatArea(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  if (value >= 1000000) {
    return `${(
      value / 1000000
    ).toFixed(2)}M km²`;
  }

  if (value >= 1000) {
    return `${Math.round(
      value
    ).toLocaleString()} km²`;
  }

  return `${value.toFixed(1)} km²`;
}

async function computeRegionChartStats(viewName) {
  const cacheKey =
    `${viewName}-medium`;

  if (chartStatsCache[cacheKey]) {
    return chartStatsCache[cacheKey];
  }

  const bounds =
    regionBounds[viewName] ||
    regionBounds.global;

  const [
    grid2000,
    grid2013,
    grid2025,
    changeGrid
  ] = await Promise.all([
    loadGrid("2000", "medium"),
    loadGrid("2013", "medium"),
    loadGrid("2025", "medium"),
    loadGrid(changeDataset, "medium")
  ]);

  const totals = gridChangeTotals(
    changeGrid,
    bounds
  );

  const changedCells =
    totals.growthCount + totals.declineCount;

  const stats = {
    ndvi: {
      "2000": gridMeanNdvi(grid2000, bounds),
      "2013": gridMeanNdvi(grid2013, bounds),
      "2025": gridMeanNdvi(grid2025, bounds)
    },

    change: {
      growthPct: changedCells
        ? totals.growthCount / changedCells
        : 0,

      declinePct: changedCells
        ? totals.declineCount / changedCells
        : 0,

      addedAreaKm2: totals.addedAreaKm2,
      lostAreaKm2: totals.lostAreaKm2
    }
  };

  chartStatsCache[cacheKey] = stats;

  return stats;
}

/* =========================================================
   Chart rendering

   The four figures below are the finding - the bars beside
   them only show that the three years are close. Until now
   the bars tweened and the figures were rewritten between
   frames, so half the panel moved and half of it blinked,
   which reads as a rendering fault rather than a choice.

   They count instead. The figures are already set in
   tabular-nums, so the digits change in place without the
   column reflowing on every frame - the panel was built for
   this, it just was not doing it.
   ========================================================= */

const FIGURE_COUNT_MS = 620;

/* The stylesheet's signature curve, in a form rAF can use.
   Hard deceleration: the number is nearly right almost at
   once, and the last stretch is the part that reads as
   settling on an answer. */

function easeOutExpo(t) {
  return t === 1
    ? 1
    : 1 - Math.pow(2, -10 * t);
}

function animateFigure(element, from, to, format) {
  if (
    prefersReducedMotion() ||
    from === to ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    element.textContent = format(to);

    return;
  }

  const startedAt =
    performance.now();

  function step(now) {
    /* The panel is rebuilt wholesale on every region change,
       so a frame belonging to the previous region will find
       its element detached. Stopping on that is what keeps
       two counts from fighting over one figure. */
    if (!element.isConnected) {
      return;
    }

    const progress = Math.min(
      1,
      (now - startedAt) / FIGURE_COUNT_MS
    );

    element.textContent = format(
      from + (to - from) * easeOutExpo(progress)
    );

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  element.textContent = format(from);

  requestAnimationFrame(step);
}

/* Walks whatever figures the freshly written markup contains
   and counts each from wherever the last region left it. */

function playFigureCounts(root, formats) {
  root
    .querySelectorAll("[data-figure]")
    .forEach(element => {
      const key =
        element.dataset.figure;

      const to = Number(
        element.dataset.figureValue
      );

      const from =
        previousChartFigures[key] ?? to;

      previousChartFigures[key] = to;

      animateFigure(
        element,
        from,
        to,
        formats[key]
      );
    });
}

function renderRegionCharts(viewName, stats) {
  const chartTitle =
    document.querySelector("#chart-title");

  const ndviChart =
    document.querySelector("#ndvi-bar-chart");

  const changeChart =
    document.querySelector("#change-summary-chart");

  const areaChart =
    document.querySelector("#area-summary-chart");

  const caption =
    document.querySelector("#chart-caption");

  if (
    !chartTitle ||
    !ndviChart ||
    !changeChart ||
    !areaChart ||
    !caption
  ) {
    return;
  }

  chartTitle.textContent =
    regionLabels[viewName] ||
    regionLabels.global;

  const years = [
    "2000",
    "2013",
    "2025"
  ];

  ndviChart.innerHTML = years
    .map(year => {
      const value =
        stats.ndvi[year];

      const safeValue =
        value === null ? 0 : value;

      const targetWidth = Math.max(
        3,
        Math.min(
          100,
          safeValue * 100
        )
      );

      const startWidth =
        previousNdviBarWidths[year] ?? 0;

      return `
        <div class="bar-row">
          <span>${year}</span>

          <div class="bar-track">
            <div
              class="bar-fill"
              data-year="${year}"
              data-target-width="${targetWidth}"
              style="width: ${startWidth}%"
            ></div>
          </div>

          <span>
            ${
              value === null
                ? "N/A"
                : value.toFixed(3)
            }
          </span>
        </div>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    const bars =
      ndviChart.querySelectorAll(".bar-fill");

    bars.forEach(bar => {
      const year =
        bar.dataset.year;

      const targetWidth = Number(
        bar.dataset.targetWidth
      );

      bar.style.width =
        `${targetWidth}%`;

      previousNdviBarWidths[year] =
        targetWidth;
    });
  });

  const growthPercentage =
    Math.round(
      stats.change.growthPct * 100
    );

  const declinePercentage =
    Math.round(
      stats.change.declinePct * 100
    );

  changeChart.innerHTML = `
    <div class="change-box growth">
      <strong
        data-figure="growthPct"
        data-figure-value="${growthPercentage}"
      >${growthPercentage}%</strong>

      <span>growth cells</span>
    </div>

    <div class="change-box decline">
      <strong
        data-figure="declinePct"
        data-figure-value="${declinePercentage}"
      >${declinePercentage}%</strong>

      <span>decline cells</span>
    </div>
  `;

  areaChart.innerHTML = `
    <div class="area-box added">
      <strong
        data-figure="addedArea"
        data-figure-value="${stats.change.addedAreaKm2}"
      >${formatArea(stats.change.addedAreaKm2)}</strong>

      <span>
        estimated added green-space area
      </span>
    </div>

    <div class="area-box lost">
      <strong
        data-figure="lostArea"
        data-figure-value="${stats.change.lostAreaKm2}"
      >${formatArea(stats.change.lostAreaKm2)}</strong>

      <span>
        estimated lost green-space area
      </span>
    </div>
  `;

  /* Percentages are whole numbers on screen, so they are
     rounded per frame rather than counting through decimals
     nobody ever sees. formatArea() already does its own
     rounding at each magnitude. */
  const figureFormats = {
    growthPct: value =>
      `${Math.round(value)}%`,

    declinePct: value =>
      `${Math.round(value)}%`,

    addedArea: formatArea,
    lostArea: formatArea
  };

  playFigureCounts(
    changeChart,
    figureFormats
  );

  playFigureCounts(
    areaChart,
    figureFormats
  );

  caption.textContent =
    "Area values are approximate and are calculated from changed MODIS NDVI grid cells in the selected region.";
}

async function updateRegionCharts(viewName) {
  const chartTitle =
    document.querySelector("#chart-title");

  const ndviChart =
    document.querySelector("#ndvi-bar-chart");

  const caption =
    document.querySelector("#chart-caption");

  if (chartTitle) {
    chartTitle.textContent =
      regionLabels[viewName] ||
      regionLabels.global;
  }

  if (
    ndviChart &&
    !ndviChart.querySelector(".bar-row")
  ) {
    ndviChart.innerHTML = `
      <div class="chart-loading">
        Loading regional data...
      </div>
    `;
  }

  if (caption) {
    caption.textContent =
      "Calculating summary for the selected region...";
  }

  try {
    const stats =
      await computeRegionChartStats(viewName);

    renderRegionCharts(
      viewName,
      stats
    );
  } catch (error) {
    console.error(
      "Unable to calculate regional chart:",
      error
    );

    if (caption) {
      caption.textContent =
        "The regional summary could not be calculated.";
    }
  }
}

/* =========================================================
   Mobile chart
   ========================================================= */

function setupMobileChartToggle() {
  const toggleButton =
    document.querySelector("#mobile-chart-toggle");

  const closeButton =
    document.querySelector("#chart-close-button");

  const chartPanel =
    document.querySelector(".chart-panel");

  if (
    !toggleButton ||
    !chartPanel
  ) {
    return;
  }

  toggleButton.addEventListener("click", () => {
    if (currentMode === "compare") {
      return;
    }

    const isOpen =
      document.body.classList.toggle(
        "mobile-chart-open"
      );

    toggleButton.textContent =
      isOpen
        ? "Hide Summary"
        : "Summary";
  });

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      closeMobileChart
    );
  }
}

function closeMobileChart() {
  const button =
    document.querySelector("#mobile-chart-toggle");

  document.body.classList.remove(
    "mobile-chart-open"
  );

  if (button) {
    button.textContent = "Summary";
  }
}

/* =========================================================
   About modal
   ========================================================= */

function setupAboutModal() {
  const openButton =
    document.querySelector("#about-button");

  const closeButton =
    document.querySelector("#about-close-button");

  const modal =
    document.querySelector("#about-modal");

  if (
    !openButton ||
    !closeButton ||
    !modal
  ) {
    return;
  }

  function openModal() {
    document.body.classList.add(
      "about-open"
    );

    modal.setAttribute(
      "aria-hidden",
      "false"
    );
  }

  function closeModal() {
    document.body.classList.remove(
      "about-open"
    );

    modal.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  openButton.addEventListener(
    "click",
    openModal
  );

  closeButton.addEventListener(
    "click",
    closeModal
  );

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

/* =========================================================
   Guided tour
   ========================================================= */

function setupGuidedTour() {
  const overlay =
    document.querySelector("#tour-overlay");

  const nextButton =
    document.querySelector("#tour-next-button");

  const skipButton =
    document.querySelector("#tour-skip-button");

  if (
    !overlay ||
    !nextButton ||
    !skipButton
  ) {
    return;
  }

  nextButton.addEventListener("click", async () => {
    if (
      currentTourStep >=
      tourSteps.length - 1
    ) {
      await closeGuidedTour();
      openTakeawayPanel();
      return;
    }

    currentTourStep += 1;

    await showTourStep(
      currentTourStep
    );
  });

  skipButton.addEventListener(
    "click",
    closeGuidedTour
  );
}

async function openGuidedTour() {
  currentTourStep = 0;

  document.body.classList.add(
    "tour-open"
  );

  document
    .querySelector("#tour-overlay")
    ?.setAttribute(
      "aria-hidden",
      "false"
    );

  await showTourStep(
    currentTourStep
  );
}

async function closeGuidedTour() {
  document.body.classList.remove(
    "tour-open",
    "mobile-chart-open"
  );

  setTourFraming(singleMap);

  /* Back to the staged phase so a restart enters rather than
     appearing already settled. */
  const card =
    document.querySelector(".tour-card");

  if (card) {
    card.dataset.phase = "enter";
  }

  document
    .querySelector("#tour-overlay")
    ?.setAttribute(
      "aria-hidden",
      "true"
    );

  const button =
    document.querySelector("#mobile-chart-toggle");

  if (button) {
    button.textContent = "Summary";
  }

  activeView = "global";

  syncRegionControl("global");

  updateStoryPanel("global");

  await updateRegionCharts("global");

  document
    .querySelectorAll(".compare-tab")
    .forEach(tab => {
      tab.classList.remove("selected");
    });

  const presentTab =
    document.querySelector(
      '.compare-tab[data-mode="present"]'
    );

  if (presentTab) {
    presentTab.classList.add("selected");
  }

  await setMode("present");

  jumpMapTo(
    singleMap,
    views.global
  );

  await refreshVisibleData(true);

  resizeMaps();
}

/* =========================================================
   Tour copy motion

   The copy is not in a card any more, so a step change has no
   frame moving to announce it - the words have to do that
   themselves. Three phases on one attribute:

     exit  - the outgoing copy lifts and clears, fast
     enter - the incoming copy is staged below, blurred
     in    - it rises, in reading order

   Staging and releasing are separate phases on purpose. Set the
   final state in the same frame as the initial one and the
   browser coalesces them into no transition at all, so `enter`
   is committed, a frame is allowed to pass, and only then does
   `in` follow.
   ========================================================= */

const TOUR_EXIT_MS = 160;

/*
  While the tour is up, the globe steps aside rather than being painted
  over. The copy sits in the left column, so the map gets left padding
  and Mapbox re-anchors the projection to the space that is left - the
  planet slides right and the narrative gets a column of its own.

  This is the part that makes an unboxed layout work. A wash over the
  globe can make text legible, but it does it by dimming the data, and
  the data is the thing the sentence is describing. Moving the subject
  costs nothing and dims nothing.

  Only on viewports wide enough to have two columns; below that the copy
  runs full-width and there is no aside to step into. Compare mode is
  excluded because its two globes are already framed inside their own
  halves and shifting them would push one into the divider.
*/

const TOUR_PAD_MIN_WIDTH = 900;
const TOUR_PAD_LEFT = 400;

/* The gutter this map should currently hold open, in px. Only the
   single map ever yields one: the compare pair is already framed
   inside its own halves, and shifting the left globe would push it
   into the divider. */

function tourFramingPadding(map) {
  const wants =
    map === singleMap &&
    document.body.classList.contains("tour-open") &&
    window.innerWidth >= TOUR_PAD_MIN_WIDTH;

  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: wants ? TOUR_PAD_LEFT : 0
  };
}

/* For the steps that change nothing about the camera - and for
   opening and closing the tour, which do not fly at all - the
   padding still has to move on its own. setPadding rather than
   easeTo: an ease here would be cancelled by any flight still in
   the air, which is exactly the bug this pair exists to avoid.
   When a flight IS running it already carries the new padding, so
   there is nothing to do. */

function setTourFraming(map) {
  /* Mid-flight the camera owns the padding, and whatever is flying
     was given the current target when it launched. The one case
     that needs catching is a flight launched BEFORE the tour opened
     - the reveal's own 2.8s glide - which is still carrying left: 0
     when step one arrives. Wait for it to land, then reframe. */
  if (map.isMoving()) {
    map.once("moveend", () => setTourFraming(map));
    return;
  }

  const target = tourFramingPadding(map);
  const current = map.getPadding?.() || {};

  if (Math.round(current.left || 0) === target.left) {
    return;
  }

  if (prefersReducedMotion()) {
    map.setPadding(target);
    return;
  }

  map.easeTo({
    padding: target,
    duration: 700
  });

  /* An eased camera only advances on rendered frames, so in a tab
     that is not rendering - backgrounded, occluded, throttled - this
     starts and then hangs at its first value. The gutter is what
     keeps the copy off the globe, so it is not allowed to depend on
     the tab being visible. Once the ease has had well past its own
     duration to land, take the end state directly. */
  window.setTimeout(() => {
    const now = map.getPadding?.() || {};

    /* Deliberately not conditioned on isMoving(): a stalled ease
       reports as moving forever, which is precisely the state this
       is here to rescue. By now the ease has had 500ms past its own
       duration, so anything short of the target is a stall. */
    if (Math.round(now.left || 0) !== target.left) {
      map.setPadding(target);
    }
  }, 1200);
}

function tourLineDelay(index) {
  /* Starts after the heading has begun moving and steps by less
     than the intro's, because there are more lines here and the
     reader is waiting on them rather than being introduced. */
  return (0.16 + index * 0.055).toFixed(3) + "s";
}

let tourSplitWidth = 0;

function splitTourText() {
  const text =
    document.querySelector("#tour-text");

  if (!text) {
    return;
  }

  tourSplitWidth =
    text.getBoundingClientRect().width;

  splitElementIntoLines(text, {
    lineClass: "tour-line",
    innerClass: "tour-line-inner",
    delayFor: tourLineDelay
  });
}

/* Captured lines are only correct at the width they were measured
   at - render them narrower and each one re-wraps, orphaning its
   last word onto a line of its own. The intro guards this the same
   way; the tour needs it too because its copy outlives a resize.

   Re-split settled, not mid-reveal: rebuilding the spans while they
   are still rising would recreate them already in place. */

function resplitTourIfWidthChanged() {
  const card =
    document.querySelector(".tour-card");

  const text =
    document.querySelector("#tour-text");

  if (
    !card ||
    !text ||
    card.dataset.phase !== "in"
  ) {
    return;
  }

  const width =
    text.getBoundingClientRect().width;

  if (Math.abs(width - tourSplitWidth) < 0.5) {
    return;
  }

  splitTourText();

  /* The fresh spans start staged, so release them immediately -
     the reader is mid-step and did not ask for a replay. */
  card.querySelectorAll(".tour-line-inner").forEach(inner => {
    inner.style.transitionDelay = "0s";
  });

  void card.offsetHeight;
}

function prefersReducedMotion() {
  return window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
}

/* Resolves once the outgoing copy is gone. Skipped on the first
   step, where there is nothing to clear. */

function playTourTextExit(card) {
  if (
    !card ||
    card.dataset.phase === "enter"
  ) {
    return Promise.resolve();
  }

  card.dataset.phase = "exit";

  if (prefersReducedMotion()) {
    return Promise.resolve();
  }

  /* setTimeout rather than transitionend: a transition that never
     starts - reduced motion, a background tab, an interrupted
     step - never fires the event, and the copy would be stuck
     mid-exit waiting for it. */
  return new Promise(resolve =>
    window.setTimeout(resolve, TOUR_EXIT_MS)
  );
}

function playTourTextEnter(card) {
  if (!card) {
    return;
  }

  card.dataset.phase = "enter";

  /* Measured while staged. The lines are positioned by their own
     mask rather than by layout, so splitting here costs nothing
     visually and the widths are already final. */
  splitTourText();

  /* Commit the staged state before releasing it. Set both in one
     go and the browser collapses them into no transition at all.

     A forced reflow rather than a rAF pair: requestAnimationFrame
     is throttled to a stop in a background tab, and a tour left
     mid-enter when someone switches away would still be invisible
     when they came back. Reading a layout property flushes style
     synchronously and cannot be deferred. */
  void card.offsetHeight;

  card.dataset.phase = "in";
}

async function showTourStep(index) {
  const step = tourSteps[index];

  const title =
    document.querySelector("#tour-title");

  const text =
    document.querySelector("#tour-text");

  const count =
    document.querySelector("#tour-step-count");

  const nextButton =
    document.querySelector("#tour-next-button");

  if (
    !step ||
    !title ||
    !text ||
    !count ||
    !nextButton
  ) {
    return;
  }

  const previousView = activeView;

  const card =
    document.querySelector(".tour-card");

  await playTourTextExit(card);

  title.textContent = step.title;

  /* Reset the source the splitter caches, or the next split
     would rebuild the previous step's sentence. */
  delete text.dataset.sourceText;
  text.textContent = step.text;

  count.textContent =
    `Step ${index + 1} of ${tourSteps.length}`;

  nextButton
    .querySelectorAll(".start-button-label")
    .forEach(label => {
      label.textContent =
        index === tourSteps.length - 1
          ? "Finish"
          : "Next";
    });

  /* Not awaited. The camera below takes 2.8s and the copy has
     nothing to learn from it - making the words wait on the
     flight would leave the corner empty for most of the step. */
  playTourTextEnter(card);

  if (step.view) {
    activeView = step.view;

    updateStoryPanel(step.view);

    await updateRegionCharts(step.view);

    syncRegionControl(step.view);
  }

  if (
    step.mode &&
    currentMode !== step.mode
  ) {
    const tab =
      document.querySelector(
        `.compare-tab[data-mode="${step.mode}"]`
      );

    document
      .querySelectorAll(".compare-tab")
      .forEach(item => {
        item.classList.remove("selected");
      });

    if (tab) {
      tab.classList.add("selected");
    }

    await setMode(step.mode);
  }

  setTourFraming(singleMap);

  if (step.openChart) {
    document.body.classList.add(
      "mobile-chart-open"
    );

    const button =
      document.querySelector("#mobile-chart-toggle");

    if (button) {
      button.textContent =
        "Hide Summary";
    }
  } else {
    closeMobileChart();
  }

  if (
    step.view &&
    index !== 0 &&
    step.view !== previousView
  ) {
    await flyAllTo(step.view);
  }
}

/* =========================================================
   Takeaway panel
   ========================================================= */

function setupTakeawayPanel() {
  const overlay =
    document.querySelector("#takeaway-overlay");

  const closeButton =
    document.querySelector("#takeaway-close-button");

  const continueButton =
    document.querySelector("#takeaway-continue-button");

  const restartButton =
    document.querySelector("#takeaway-restart-button");

  if (!overlay) {
    return;
  }

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      closeTakeawayPanel
    );
  }

  if (continueButton) {
    continueButton.addEventListener(
      "click",
      closeTakeawayPanel
    );
  }

  if (restartButton) {
    restartButton.addEventListener(
      "click",
      async () => {
        closeTakeawayPanel();
        await openGuidedTour();
      }
    );
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      closeTakeawayPanel();
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("takeaway-open")
    ) {
      closeTakeawayPanel();
    }
  });
}

function openTakeawayPanel() {
  const overlay =
    document.querySelector("#takeaway-overlay");

  document.body.classList.add(
    "takeaway-open"
  );

  if (overlay) {
    overlay.setAttribute(
      "aria-hidden",
      "false"
    );
  }
}

function closeTakeawayPanel() {
  const overlay =
    document.querySelector("#takeaway-overlay");

  document.body.classList.remove(
    "takeaway-open"
  );

  if (overlay) {
    overlay.setAttribute(
      "aria-hidden",
      "true"
    );
  }
}

/* =========================================================
   Splash screen
   ========================================================= */

/* Stage 0 shows the title, stage 1 adds the detail and legend,
   stage 2 grows the decorative globe and hands off to the tour. */

function updateSplashStatus(message) {
  const status =
    document.querySelector("#loading-status");

  if (status) {
    status.textContent = message;
  }
}

/* The button stacks two faces for the hover inversion, so both
   copies of the label have to say the same thing. */

function setSplashCtaLabel(text) {
  const labels =
    document.querySelectorAll(
      "#start-button .start-button-label"
    );

  labels.forEach(label => {
    label.textContent = text;
  });
}

function refreshSplashCta() {
  const button =
    document.querySelector("#start-button");

  if (!button) {
    return;
  }

  if (splashStage === 0) {
    button.disabled = false;

    setSplashCtaLabel("Start the tour");

    if (appReady) {
      updateSplashStatus("");
    }

    return;
  }

  /* From stage 1 the CTA carries its own state: the label says
     what the next click does, and the spinner inside the button
     covers the not-yet-ready case, so the status line under it
     goes away. It stays in the DOM as a live region — CSS takes
     it out of the layout, not out of the accessibility tree. */

  button.disabled = !appReady;

  setSplashCtaLabel("Reveal the globe");

  updateSplashStatus(
    appReady
      ? "Ready"
      : "Preparing the globe..."
  );
}

/* The stand-in globe steps aside as soon as the real map has
   something to show behind the blur. */

function enableStartButton() {
  const splash =
    document.querySelector("#splash-screen");

  if (splash) {
    splash.dataset.mapReady = "true";
  }

  refreshSplashCta();
}

function setSplashStage(stage) {
  const splash =
    document.querySelector("#splash-screen");

  if (!splash) {
    return;
  }

  /* Stage 1 is the moment the copy becomes visible, so make sure
     the lines match the current width before revealing them. This
     runs before the stage flips, so rebuilt lines start below
     their masks and still rise into place rather than appearing
     already settled. It is the synchronous backstop for the
     ResizeObserver, which cannot fire while the tab is hidden. */

  if (stage === 1) {
    resplitIfWidthChanged();
  }

  splashStage = stage;
  splash.dataset.stage = String(stage);

  refreshSplashCta();
}

function pause(milliseconds) {
  return new Promise(resolve => {
    window.setTimeout(
      resolve,
      prefersReducedMotion() ? 0 : milliseconds
    );
  });
}

function prefersReducedMotion() {
  return window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
}

/* Rewrap the intro paragraph one rendered line per element, so
   each line can slide up out of its own mask. Where the browser
   breaks a line is only knowable after layout, so this measures
   the words rather than guessing: every word goes in its own
   span, and a change in a span's top edge means a new line.

   Runs once fonts are ready - measuring against the fallback
   face would break the lines in the wrong places - and again on
   resize, since a new width means new break points. */

/*
  Rewrap a paragraph one rendered line per span, so each line can move
  independently - out of its own mask, on its own delay - instead of the
  whole block fading as a slab.

  The measurement is the point: there is no way to know where a line
  breaks without laying the text out first, so every word goes in as a
  probe, the probes are grouped by their top offset, and the paragraph is
  rebuilt from those groups. Whatever the browser decided is what gets
  captured.

  Shared by the intro and the guided tour. They differ only in class
  names and in how a line index becomes a delay, so those are arguments.
*/

function splitElementIntoLines(paragraph, options) {
  const {
    lineClass,
    innerClass,
    delayFor,
    startIndex = 0
  } = options;

  const source =
    paragraph.dataset.sourceText ||
    paragraph.textContent;

  paragraph.dataset.sourceText = source;

  /* Split on ordinary whitespace only: a non-breaking space is
     there to hold a phrase together, so it has to stay inside
     its token rather than becoming a break opportunity. */
  const words = source
    .trim()
    .split(/[^\S\u00a0]+/);

  paragraph.textContent = "";

  /* text-wrap: pretty balances the whole paragraph rather than
     filling each line greedily, so probing under it can break a
     line early - stranding a word like "increased" alone - to
     improve a wrap elsewhere in the block. The per-line spans
     built below already force text-wrap: wrap for display, so
     the measurement pass needs the same greedy mode or the two
     disagree about where lines break. */
  paragraph.style.textWrap = "wrap";

  const probes = words.map((word, index) => {
    const probe = document.createElement("span");

    probe.textContent =
      index === 0 ? word : " " + word;

    paragraph.appendChild(probe);

    return probe;
  });

  const lines = [];
  let lineTop = null;

  probes.forEach(probe => {
    const top = probe.getBoundingClientRect().top;

    if (
      lineTop === null ||
      Math.abs(top - lineTop) > 1
    ) {
      lineTop = top;
      lines.push([]);
    }

    lines[lines.length - 1].push(probe.textContent);
  });

  paragraph.textContent = "";

  lines.forEach((parts, index) => {
    const line = document.createElement("span");
    const inner = document.createElement("span");

    line.className = lineClass;
    inner.className = innerClass;
    inner.textContent = parts.join("").trim();

    inner.style.transitionDelay =
      delayFor(startIndex + index);

    line.appendChild(inner);
    paragraph.appendChild(line);
  });

  return lines.length;
}

function splitDetailIntoLines() {
  const paragraphs =
    document.querySelectorAll(".splash-detail-text");

  if (!paragraphs.length) {
    return;
  }

  /* The stagger runs across the whole passage rather than
     restarting per paragraph, so the copy reads as one thought
     arriving in order. */
  let lineNumber = 0;

  splitWidth =
    paragraphs[0].getBoundingClientRect().width;

  paragraphs.forEach(paragraph => {
    lineNumber += splitElementIntoLines(paragraph, {
      lineClass: "splash-line",
      innerClass: "splash-line-inner",
      startIndex: lineNumber,
      delayFor: index =>
        (0.12 + index * 0.065).toFixed(3) + "s"
    });
  });
}

let splitTimer = 0;
let splitWidth = 0;

/* The captured lines are only right for the width they were
   measured at - render them narrower and each one re-wraps,
   orphaning its last word or two onto a line of its own. Re-split
   whenever that width has actually moved, and only then:
   rebuilding mid-reveal would recreate the elements in their
   settled state and make them pop instead of rise. */

function resplitIfWidthChanged() {
  const paragraph =
    document.querySelector(".splash-detail-text");

  if (!paragraph) {
    return;
  }

  const width =
    paragraph.getBoundingClientRect().width;

  if (Math.abs(width - splitWidth) < 0.5) {
    return;
  }

  splitDetailIntoLines();
}

function scheduleLineSplit() {
  window.clearTimeout(splitTimer);

  splitTimer = window.setTimeout(
    () => {
      resplitIfWidthChanged();
      resplitTourIfWidthChanged();
    },
    150
  );
}

/* A window resize is not the only thing that changes the measure -
   a scrollbar appearing, a font swapping in, or a zoom change all
   do too, and none of them fire "resize". */

function watchDetailWidth() {
  if (typeof ResizeObserver === "undefined") {
    return;
  }

  const observer =
    new ResizeObserver(scheduleLineSplit);

  const paragraph =
    document.querySelector(".splash-detail-text");

  if (paragraph) {
    observer.observe(paragraph);
  }

  const tourText =
    document.querySelector("#tour-text");

  if (tourText) {
    observer.observe(tourText);
  }
}

function setupSplashScreen() {
  const splash =
    document.querySelector("#splash-screen");

  const button =
    document.querySelector("#start-button");

  if (!splash || !button) {
    return;
  }

  setSplashStage(0);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(splitDetailIntoLines);
  } else {
    splitDetailIntoLines();
  }

  watchDetailWidth();

  window.addEventListener(
    "resize",
    scheduleLineSplit
  );

  button.addEventListener("click", () => {
    if (splashStage === 0) {
      setSplashStage(1);
      return;
    }

    if (
      splashStage === 1 &&
      appReady
    ) {
      revealMapAndStartTour(splash);
    }
  });
}

async function revealMapAndStartTour(splash) {
  setSplashStage(2);

  /* The decorative globe grows and sharpens first, so the real
     one behind it lands in roughly the same place. */
  await pause(900);

  resizeMaps();

  splash.classList.add("hidden");

  await pause(750);

  window.removeEventListener(
    "resize",
    scheduleLineSplit
  );

  splash.remove();
  resizeMaps();

  await openGuidedTour();
}

/* =========================================================
   Service worker
   ========================================================= */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => {
        console.log(
          "Offline data cache active."
        );
      })
      .catch(error => {
        console.error(
          "Service worker registration failed:",
          error
        );
      });
  });
}
