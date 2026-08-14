const CACHE_NAME = "greening-earth-data-v1";

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Only cache files inside the data folder
  if (!url.pathname.includes("/data/")) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cachedResponse = await cache.match(event.request);

      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);

        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        console.error("Data fetch failed:", error);
        throw error;
      }
    })
  );
});