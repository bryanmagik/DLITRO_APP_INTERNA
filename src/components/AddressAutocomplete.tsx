import { useEffect, useRef, useState } from "react";
import { isGoogleMapsConfigured, loadGoogleMaps } from "@/lib/googleMaps";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export const ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 800;
export const ADDRESS_AUTOCOMPLETE_MIN_LENGTH = 3;
export const PLACES_AUTOCOMPLETE_REQUEST_EVENT = "dlitro:places-autocomplete-request";

type Suggestion = google.maps.places.AutocompleteSuggestion;
type PlaceLocation = google.maps.LatLng | { lat: number; lng: number };

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (data: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
  regionCode?: string;
  disabled?: boolean;
}

export default function AddressAutocomplete({
  id, value, onChange, onSelect, placeholder, className, hasError, regionCode = "cl", disabled = false,
}: Props) {
  const [mapsOk, setMapsOk] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const blurRef = useRef<number | null>(null);
  const requestVersionRef = useRef(0);
  const activeInputRef = useRef<string | null>(null);
  const successfulInputRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!isGoogleMapsConfigured()) {
      setMapsOk(false);
      return;
    }
    loadGoogleMaps()
      .then(() => setMapsOk(true))
      .catch((e) => {
        console.warn("[gmaps] Autocomplete no disponible, usando dirección manual:", e);
        setMapsOk(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      if (blurRef.current !== null) window.clearTimeout(blurRef.current);
      activeInputRef.current = null;
      successfulInputRef.current = null;
      sessionTokenRef.current = null;
    };
  }, []);

  const clearPendingDebounce = () => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  const handleInput = (v: string) => {
    onChange(v);
    if (mapsOk !== true) return;

    const input = v.trim();

    if (input.length < ADDRESS_AUTOCOMPLETE_MIN_LENGTH) {
      clearPendingDebounce();
      requestVersionRef.current += 1;
      activeInputRef.current = null;
      successfulInputRef.current = null;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    if (input === activeInputRef.current) return;

    if (input === successfulInputRef.current) {
      clearPendingDebounce();
      requestVersionRef.current += 1;
      activeInputRef.current = null;
      setLoading(false);
      setOpen(true);
      return;
    }

    clearPendingDebounce();
    const requestVersion = ++requestVersionRef.current;
    activeInputRef.current = input;
    setLoading(false);
    setOpen(false);

    debounceRef.current = window.setTimeout(async () => {
      debounceRef.current = null;
      try {
        setLoading(true);
        const g = await loadGoogleMaps();
        const places = await g.maps.importLibrary("places") as google.maps.PlacesLibrary;
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        }
        window.dispatchEvent(new CustomEvent(PLACES_AUTOCOMPLETE_REQUEST_EVENT, {
          detail: { regionCode },
        }));
        const { suggestions: sugs } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: [regionCode],
        });
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
        setSuggestions(sugs || []);
        successfulInputRef.current = input;
        activeInputRef.current = null;
        setOpen(true);
      } catch (e) {
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
        activeInputRef.current = null;
        successfulInputRef.current = null;
        console.error("[gmaps autocomplete]", e);
        setSuggestions([]);
        setOpen(false);
      } finally {
        if (mountedRef.current && requestVersion === requestVersionRef.current) setLoading(false);
      }
    }, ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS);
  };

  const abandonSearch = () => {
    clearPendingDebounce();
    requestVersionRef.current += 1;
    activeInputRef.current = null;
    setLoading(false);
    blurRef.current = window.setTimeout(() => {
      setOpen(false);
      sessionTokenRef.current = null;
      successfulInputRef.current = null;
      blurRef.current = null;
    }, 200);
  };

  const pick = async (sug: Suggestion) => {
    try {
      const place = sug.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      const addr = place.formattedAddress || sug.placePrediction.text?.text || "";
      const loc = place.location as PlaceLocation | undefined;
      const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
      onChange(addr);
      onSelect({ address: addr, lat: Number(lat), lng: Number(lng) });
      setOpen(false);
      setSuggestions([]);
      sessionTokenRef.current = null;
      activeInputRef.current = null;
      successfulInputRef.current = null;
    } catch (e) {
      console.error("[gmaps pick]", e);
    }
  };

  if (mapsOk === null) {
    return (
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled
          placeholder="Cargando mapas…"
          className={className}
        />
        <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mapsOk === false) {
    return (
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Dirección de envío (manual)"}
        maxLength={200}
        className={`${hasError ? "border-destructive ring-1 ring-destructive" : ""} ${className ?? ""}`}
      />
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={abandonSearch}
        onFocus={() => {
          if (blurRef.current !== null) {
            window.clearTimeout(blurRef.current);
            blurRef.current = null;
          }
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        maxLength={200}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${hasError ? "border-destructive ring-1 ring-destructive" : ""} ${className ?? ""}`}
      />
      {loading && (
        <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-auto">
          {suggestions.map((s, i) => {
            const p = s.placePrediction;
            if (!p) return null;
            return (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border last:border-0"
              >
                <div className="font-medium text-foreground">{p.mainText?.text || p.text?.text}</div>
                {p.secondaryText?.text && (
                  <div className="text-xs text-muted-foreground">{p.secondaryText.text}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
