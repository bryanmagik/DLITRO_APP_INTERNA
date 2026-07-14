import { useEffect, useRef, useState } from "react";
import { isGoogleMapsConfigured, loadGoogleMaps } from "@/lib/googleMaps";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface Suggestion {
  placePrediction: {
    toPlace: () => { fetchFields: (opts: { fields: string[] }) => Promise<void>; formattedAddress?: string; location?: { lat: () => number; lng: () => number } | { lat: number; lng: number } };
    text?: { text?: string };
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (data: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
  regionCode?: string;
}

export default function AddressAutocomplete({
  value, onChange, onSelect, placeholder, className, hasError, regionCode = "cl",
}: Props) {
  const [mapsOk, setMapsOk] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionTokenRef = useRef<unknown>(null);
  const debounceRef = useRef<number | null>(null);

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

  const handleInput = (v: string) => {
    onChange(v);
    if (mapsOk !== true) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!v.trim() || v.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        const g = await loadGoogleMaps();
        const places = await g.maps.importLibrary("places") as google.maps.PlacesLibrary;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        }
        const { suggestions: sugs } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: v,
          sessionToken: sessionTokenRef.current as google.maps.AutocompleteSessionToken,
          includedRegionCodes: [regionCode],
        });
        setSuggestions((sugs as Suggestion[]) || []);
        setOpen(true);
      } catch (e) {
        console.error("[gmaps autocomplete]", e);
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const pick = async (sug: Suggestion) => {
    try {
      const place = sug.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      const addr = place.formattedAddress || sug.placePrediction.text?.text || "";
      const loc = place.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : (loc as { lat: number })?.lat;
      const lng = typeof loc?.lng === "function" ? loc.lng() : (loc as { lng: number })?.lng;
      onChange(addr);
      onSelect({ address: addr, lat: Number(lat), lng: Number(lng) });
      setOpen(false);
      setSuggestions([]);
      sessionTokenRef.current = null;
    } catch (e) {
      console.error("[gmaps pick]", e);
    }
  };

  if (mapsOk === null) {
    return (
      <div className="relative">
        <Input
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
        value={value}
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
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
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
