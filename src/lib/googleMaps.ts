let loadPromise: Promise<typeof google> | null = null;

export function getGoogleMapsApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as Window & { google?: typeof google; __dlitroGmapsInit?: () => void };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (loadPromise) return loadPromise;

  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error("Google Maps API key missing (VITE_GOOGLE_MAPS_API_KEY)"));
  }

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = "__dlitroGmapsInit";
    w[callbackName] = () => {
      delete w[callbackName];
      if (w.google?.maps) resolve(w.google);
      else {
        loadPromise = null;
        reject(new Error("Google Maps loaded but google.maps is unavailable"));
      }
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      delete w[callbackName];
      reject(new Error("Failed to load Google Maps JS API"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
