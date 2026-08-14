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

const spikeFilesByDetail = {
  "2000": {
    low: "data/actual_ndvi_spikes_2000_low.json",
    medium: "data/actual_ndvi_spikes_2000_medium.json",
    high: "data/actual_ndvi_spikes_2000_high.json"
  },

  "2013": {
    low: "data/actual_ndvi_spikes_2013_low.json",
    medium: "data/actual_ndvi_spikes_2013_medium.json",
    high: "data/actual_ndvi_spikes_2013_high.json"
  },

  "2025": {
    low: "data/actual_ndvi_spikes_2025_low.json",
    medium: "data/actual_ndvi_spikes_2025_medium.json",
    high: "data/actual_ndvi_spikes_2025_high.json"
  }
};

const changeFilesByDetail = {
  low: "data/actual_ndvi_change_2000_2025_low.json",
  medium: "data/actual_ndvi_change_2000_2025_medium.json",
  high: "data/actual_ndvi_change_2000_2025_high.json"
};

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

let currentMode = "present";
let activeView = "global";
let compareBaseYear = "2000";
let currentTourStep = 0;

let cachedData = {};
let cachedChangeData = {};

let syncing = false;
let isLoadingDetail = false;
let appReady = false;

let activeDetail = {
  present: "low",
  compare: null,
  change: null
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

const leftMap = new mapboxgl.Map({
  container: "left-map",
  ...mapOptions
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

  const data2025Low = await getGeoJSON("2025", "low");

  setupMapLayer(singleMap, data2025Low, "present");
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
  activeDetail.present = "low";

  jumpMapTo(singleMap, views.global);
  jumpMapTo(leftMap, views.global);
  jumpMapTo(rightMap, views.global);

  resizeMaps();
  preloadLikelyNextFiles();

  appReady = true;

  updateSplashStatus("Map ready. Click Start to explore.");
  enableStartButton();
}

/* =========================================================
   Theme
   ========================================================= */

function setupThemeSwitcher() {
  const themeSelect = document.querySelector("#theme-select");

  if (!themeSelect) {
    return;
  }

  const savedTheme =
    localStorage.getItem("theme-preference") || "auto";

  document.documentElement.dataset.theme = savedTheme;
  themeSelect.value = savedTheme;

  themeSelect.addEventListener("change", () => {
    const selectedTheme = themeSelect.value;

    localStorage.setItem(
      "theme-preference",
      selectedTheme
    );

    document.documentElement.dataset.theme = selectedTheme;
  });
}

/* =========================================================
   Data loading
   ========================================================= */

function preloadLikelyNextFiles() {
  window.setTimeout(() => {
    getGeoJSON("2025", "medium").catch(console.error);
    getGeoJSON("2000", "medium").catch(console.error);
    getGeoJSON("2013", "medium").catch(console.error);
    getChangeGeoJSON("medium").catch(console.error);
  }, 1500);
}

async function getGeoJSON(year, detail) {
  const key = `${year}-${detail}`;

  if (!cachedData[key]) {
    cachedData[key] = loadGeoJSON(
      spikeFilesByDetail[year][detail]
    );
  }

  return cachedData[key];
}

async function getChangeGeoJSON(detail) {
  if (!cachedChangeData[detail]) {
    cachedChangeData[detail] = loadGeoJSON(
      changeFilesByDetail[detail]
    );
  }

  return cachedChangeData[detail];
}

async function loadGeoJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(
      `Failed to load ${path}: ${response.status}`
    );
  }

  return response.json();
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

function getChangePaint() {
  return {
    "fill-extrusion-color": [
      "case",
      [">", ["get", "change"], 0],
      "#2ca25f",
      "#e76f51"
    ],

    "fill-extrusion-height": [
      "min",
      [
        "*",
        ["abs", ["get", "change"]],
        320000
      ],
      65000
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

function setupDetailSwitching() {
  const handleSingleZoom = debounce(async () => {
    if (
      currentMode === "present" ||
      currentMode === "change"
    ) {
      await loadDetailForCurrentView(
        activeView,
        getCurrentCamera(singleMap)
      );
    }
  }, 300);

  const handleCompareZoom = debounce(async map => {
    if (currentMode === "compare") {
      await loadDetailForCurrentView(
        activeView,
        getCurrentCamera(map)
      );
    }
  }, 300);

  singleMap.on("zoomend", handleSingleZoom);

  leftMap.on("zoomend", () => {
    handleCompareZoom(leftMap);
  });

  rightMap.on("zoomend", () => {
    handleCompareZoom(rightMap);
  });
}

async function loadDetailForCurrentView(viewName, view) {
  if (isLoadingDetail || !view) {
    return;
  }

  const detail =
    currentMode === "change"
      ? changeDetailFromZoom(view.zoom, viewName)
      : detailFromZoom(view.zoom, viewName);

  if (detail === activeDetail[currentMode]) {
    return;
  }

  isLoadingDetail = true;

  try {
    if (currentMode === "present") {
      const data2025 = await getGeoJSON(
        "2025",
        detail
      );

      const source =
        singleMap.getSource("spikes");

      if (source) {
        source.setData(data2025);
      }

      activeDetail.present = detail;
    }

    if (currentMode === "compare") {
      const [leftData, rightData] =
        await Promise.all([
          getGeoJSON(compareBaseYear, detail),
          getGeoJSON("2025", detail)
        ]);

      const leftSource =
        leftMap.getSource("spikes");

      const rightSource =
        rightMap.getSource("spikes");

      if (leftSource) {
        leftSource.setData(leftData);
      }

      if (rightSource) {
        rightSource.setData(rightData);
      }

      activeDetail.compare = detail;
    }

    if (currentMode === "change") {
      const changeData =
        await getChangeGeoJSON(detail);

      const source =
        singleMap.getSource("change-spikes");

      if (source) {
        source.setData(changeData);
      }

      activeDetail.change = detail;
    }
  } catch (error) {
    console.error(
      "Unable to change map detail:",
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

      const camera =
        getCurrentCamera(leftMap);

      const detail =
        detailFromZoom(
          camera.zoom,
          activeView
        );

      const data =
        await getGeoJSON(
          compareBaseYear,
          detail
        );

      const source =
        leftMap.getSource("spikes");

      if (source) {
        source.setData(data);
      }

      activeDetail.compare = detail;
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
}

async function setMode(mode) {
  const previousCamera =
    getVisibleCamera() || views.global;

  currentMode = mode;

  document.body.classList.remove(
    "mode-compare",
    "mode-present",
    "mode-change"
  );

  document.body.classList.add(
    `mode-${mode}`
  );

  if (mode === "compare") {
    closeMobileChart();

    const detail =
      detailFromZoom(
        previousCamera.zoom,
        activeView
      );

    const [leftData, rightData] =
      await Promise.all([
        getGeoJSON(compareBaseYear, detail),
        getGeoJSON("2025", detail)
      ]);

    const leftSource =
      leftMap.getSource("spikes");

    const rightSource =
      rightMap.getSource("spikes");

    if (leftSource) {
      leftSource.setData(leftData);
    }

    if (rightSource) {
      rightSource.setData(rightData);
    }

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

    activeDetail.compare = detail;

    jumpMapTo(leftMap, previousCamera);
    jumpMapTo(rightMap, previousCamera);
  }

  if (mode === "present") {
    clearCompareMaps();

    const detail =
      detailFromZoom(
        previousCamera.zoom,
        activeView
      );

    const data2025 =
      await getGeoJSON(
        "2025",
        detail
      );

    const source =
      singleMap.getSource("spikes");

    if (source) {
      source.setData(data2025);
    }

    if (singleMap.getLayer("spikes-layer")) {
      singleMap.setLayoutProperty(
        "spikes-layer",
        "visibility",
        "visible"
      );

      singleMap.setPaintProperty(
        "spikes-layer",
        "fill-extrusion-opacity",
        0.92
      );
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty(
        "change-spikes-layer",
        "visibility",
        "none"
      );
    }

    activeDetail.present = detail;

    if (activeView === "global") {
      jumpMapTo(singleMap, views.global);
    } else {
      jumpMapTo(singleMap, previousCamera);
    }
  }

  if (mode === "change") {
    clearCompareMaps();

    const detail =
      changeDetailFromZoom(
        previousCamera.zoom,
        activeView
      );

    const changeData =
      await getChangeGeoJSON(detail);

    const source =
      singleMap.getSource("change-spikes");

    if (source) {
      source.setData(changeData);
    }

    if (singleMap.getLayer("spikes-layer")) {
      singleMap.setLayoutProperty(
        "spikes-layer",
        "visibility",
        "none"
      );
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty(
        "change-spikes-layer",
        "visibility",
        "visible"
      );
    }

    activeDetail.change = detail;

    if (activeView === "global") {
      jumpMapTo(singleMap, views.global);
    } else {
      jumpMapTo(singleMap, previousCamera);
    }
  }

  resizeMaps();
}

/* =========================================================
   Region controls
   ========================================================= */

function setupRegionJump() {
  const select =
    document.querySelector("#region-select");

  if (!select) {
    return;
  }

  select.addEventListener("change", async () => {
    const viewName = select.value;

    activeView = viewName;

    updateStoryPanel(viewName);
    closeMobileChart();

    await Promise.all([
      updateRegionCharts(viewName),
      flyAllTo(viewName)
    ]);
  });
}

function updateStoryPanel(viewName) {
  const story = storyText[viewName];

  if (!story) {
    return;
  }

  const title =
    document.querySelector("#story-title");

  const text =
    document.querySelector("#story-text");

  if (title) {
    title.textContent = story.title;
  }

  if (text) {
    text.textContent = story.text;
  }
}

async function flyAllTo(viewName) {
  const view = views[viewName];

  if (!view) {
    return;
  }

  const primaryMap =
    currentMode === "compare"
      ? leftMap
      : singleMap;

  primaryMap.once("moveend", async () => {
    await loadDetailForCurrentView(
      viewName,
      getCurrentCamera(primaryMap)
    );
  });

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
    offset: view.offset || [0, 0]
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
            change > 0
              ? "Growth"
              : "Decline"
          }: ${
            Number.isFinite(change)
              ? change.toFixed(3)
              : "N/A"
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

function featureCenter(feature) {
  const ring =
    feature.geometry?.coordinates?.[0];

  if (!ring || !ring.length) {
    return {
      lon: 0,
      lat: 0
    };
  }

  let longitudeSum = 0;
  let latitudeSum = 0;

  ring.forEach(coordinate => {
    longitudeSum += coordinate[0];
    latitudeSum += coordinate[1];
  });

  return {
    lon: longitudeSum / ring.length,
    lat: latitudeSum / ring.length
  };
}

function pointInBounds(
  longitude,
  latitude,
  bounds
) {
  const [
    longitudeMinimum,
    longitudeMaximum,
    latitudeMinimum,
    latitudeMaximum
  ] = bounds;

  return (
    longitude >= longitudeMinimum &&
    longitude <= longitudeMaximum &&
    latitude >= latitudeMinimum &&
    latitude <= latitudeMaximum
  );
}

function polygonAreaKm2(coordinates) {
  const earthRadiusKm = 6371;
  let area = 0;

  if (
    !coordinates ||
    coordinates.length < 4
  ) {
    return 0;
  }

  for (
    let index = 0;
    index < coordinates.length - 1;
    index += 1
  ) {
    const longitude1 =
      coordinates[index][0] *
      Math.PI /
      180;

    const latitude1 =
      coordinates[index][1] *
      Math.PI /
      180;

    const longitude2 =
      coordinates[index + 1][0] *
      Math.PI /
      180;

    const latitude2 =
      coordinates[index + 1][1] *
      Math.PI /
      180;

    area +=
      (longitude2 - longitude1) *
      (
        2 +
        Math.sin(latitude1) +
        Math.sin(latitude2)
      );
  }

  return Math.abs(
    area *
      earthRadiusKm *
      earthRadiusKm /
      2
  );
}

function featureAreaKm2(feature) {
  if (
    !feature.geometry ||
    feature.geometry.type !== "Polygon"
  ) {
    return 0;
  }

  const outerRing =
    feature.geometry.coordinates[0];

  return polygonAreaKm2(outerRing);
}

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

function mean(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce(
    (sum, value) => sum + value,
    0
  );

  return total / values.length;
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
    data2000,
    data2013,
    data2025,
    changeData
  ] = await Promise.all([
    getGeoJSON("2000", "medium"),
    getGeoJSON("2013", "medium"),
    getGeoJSON("2025", "medium"),
    getChangeGeoJSON("medium")
  ]);

  function collectMeanNDVI(data) {
    const values = [];

    data.features.forEach(feature => {
      const center =
        featureCenter(feature);

      if (
        !pointInBounds(
          center.lon,
          center.lat,
          bounds
        )
      ) {
        return;
      }

      const ndvi = Number(
        feature.properties?.ndvi
      );

      if (Number.isFinite(ndvi)) {
        values.push(ndvi);
      }
    });

    return mean(values);
  }

  let growthCount = 0;
  let declineCount = 0;

  let addedAreaKm2 = 0;
  let lostAreaKm2 = 0;

  changeData.features.forEach(feature => {
    const center =
      featureCenter(feature);

    if (
      !pointInBounds(
        center.lon,
        center.lat,
        bounds
      )
    ) {
      return;
    }

    const change = Number(
      feature.properties?.change
    );

    const areaKm2 =
      featureAreaKm2(feature);

    if (change > 0) {
      growthCount += 1;
      addedAreaKm2 += areaKm2;
    }

    if (change < 0) {
      declineCount += 1;
      lostAreaKm2 += areaKm2;
    }
  });

  const totalChange =
    growthCount + declineCount;

  const stats = {
    ndvi: {
      "2000": collectMeanNDVI(data2000),
      "2013": collectMeanNDVI(data2013),
      "2025": collectMeanNDVI(data2025)
    },

    change: {
      growthPct: totalChange
        ? growthCount / totalChange
        : 0,

      declinePct: totalChange
        ? declineCount / totalChange
        : 0,

      addedAreaKm2,
      lostAreaKm2
    }
  };

  chartStatsCache[cacheKey] = stats;

  return stats;
}

/* =========================================================
   Chart rendering
   ========================================================= */

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

  const title =
    storyText[viewName]?.title ||
    "Global Overview";

  chartTitle.textContent =
    `${title} Summary`;

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
      <strong>${growthPercentage}%</strong>
      <span>growth cells</span>
    </div>

    <div class="change-box decline">
      <strong>${declinePercentage}%</strong>
      <span>decline cells</span>
    </div>
  `;

  areaChart.innerHTML = `
    <div class="area-box added">
      <strong>
        ${formatArea(
          stats.change.addedAreaKm2
        )}
      </strong>

      <span>
        estimated added green-space area
      </span>
    </div>

    <div class="area-box lost">
      <strong>
        ${formatArea(
          stats.change.lostAreaKm2
        )}
      </strong>

      <span>
        estimated lost green-space area
      </span>
    </div>
  `;

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

  const title =
    storyText[viewName]?.title ||
    "Global Overview";

  if (chartTitle) {
    chartTitle.textContent =
      `${title} Summary`;
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

  const regionSelect =
    document.querySelector("#region-select");

  if (regionSelect) {
    regionSelect.value = "global";
  }

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

  await loadDetailForCurrentView(
    "global",
    getCurrentCamera(singleMap)
  );

  resizeMaps();
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

  const regionSelect =
    document.querySelector("#region-select");

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

  title.textContent = step.title;
  text.textContent = step.text;

  count.textContent =
    `Step ${index + 1} of ${tourSteps.length}`;

  nextButton.textContent =
    index === tourSteps.length - 1
      ? "Finish"
      : "Next";

  if (step.view) {
    activeView = step.view;

    updateStoryPanel(step.view);

    await updateRegionCharts(step.view);

    if (regionSelect) {
      regionSelect.value = step.view;
    }
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

function updateSplashStatus(message) {
  const status =
    document.querySelector("#loading-status");

  if (status) {
    status.textContent = message;
  }
}

function enableStartButton() {
  const button =
    document.querySelector("#start-button");

  if (!button) {
    return;
  }

  button.disabled = false;
  button.textContent =
    "Start Exploring";
}

function setupSplashScreen() {
  const splash =
    document.querySelector("#splash-screen");

  const button =
    document.querySelector("#start-button");

  if (!splash || !button) {
    return;
  }

  button.disabled = true;
  button.textContent =
    "Loading Map...";

  button.addEventListener("click", () => {
    if (!appReady) {
      return;
    }

    splash.classList.add("hidden");

    window.setTimeout(() => {
      splash.remove();
      resizeMaps();
      openGuidedTour();
    }, 600);
  });
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