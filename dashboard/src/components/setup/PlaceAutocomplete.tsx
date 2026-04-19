import { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin } from 'lucide-react';

export interface PlaceSuggestion {
  label: string;       // display text in dropdown
  name: string;        // fills the main input
  address?: string;    // optional — fills address field if provided
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  placeholder?: string;
  className?: string;
  /** 'hotel' uses Photon POI search filtered to accommodation.
   *  'location' uses Nominatim general place/city/airport search. */
  searchType?: 'hotel' | 'location';
}

// ── Photon (hotel POI search) ─────────────────────────────────────────────────

interface PhotonFeature {
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

async function searchHotels(q: string): Promise<PlaceSuggestion[]> {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&layer=poi` +
    `&osm_tag=tourism:hotel&osm_tag=tourism:hostel&osm_tag=tourism:guest_house` +
    `&osm_tag=tourism:apartment&osm_tag=tourism:motel&osm_tag=tourism:chalet`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.features as PhotonFeature[])
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties;
      const parts = [p.housenumber, p.street, p.city, p.country].filter(Boolean);
      const address = parts.join(', ');
      const label = [p.name, p.city, p.country].filter(Boolean).join(', ');
      return { label, name: p.name!, address: address || undefined };
    });
}

// ── Nominatim (general location / airport search) ─────────────────────────────

interface NominatimResult {
  display_name: string;
  address?: {
    aerodrome?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    'ISO3166-2-lvl4'?: string;
  };
  type?: string;
  class?: string;
}

async function searchLocations(q: string): Promise<PlaceSuggestion[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
    `&format=json&limit=6&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data: NominatimResult[] = await res.json();
  return data.map((r) => {
    const a = r.address ?? {};
    const city = a.aerodrome ?? a.city ?? a.town ?? a.village ?? r.display_name.split(',')[0];
    const label = [city, a.country].filter(Boolean).join(', ');
    return { label, name: label };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search…',
  className = '',
  searchType = 'location',
}: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false); // true after user selects — suppresses next search

  // Close on outside click
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  // Debounced search
  useEffect(() => {
    if (pinnedRef.current) { pinnedRef.current = false; return; }
    if (value.length < 2) { setSuggestions([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = searchType === 'hotel'
          ? await searchHotels(value)
          : await searchLocations(value);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [value, searchType]);

  function handleSelect(s: PlaceSuggestion) {
    pinnedRef.current = true;
    onChange(s.name);
    onSelect(s);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          className={`vintage-input w-full pr-8 ${className}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => { pinnedRef.current = false; onChange(e.target.value); }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          autoComplete="off"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
          {loading
            ? <Loader2 size={14} className="animate-spin" />
            : <MapPin size={14} />}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-parchment-dark rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-parchment/60 transition-colors"
              >
                <span className="font-medium text-ink truncate block">{s.label}</span>
                {s.address && s.address !== s.label && (
                  <span className="text-xs text-ink-faint truncate block">{s.address}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
