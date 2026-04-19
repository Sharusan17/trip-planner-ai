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
  /** 'hotel' formats results as venue name + full address.
   *  'location' formats results as city/place name. */
  searchType?: 'hotel' | 'location';
}

// ── Nominatim (both hotel and location search) ────────────────────────────────
// Both modes use the same Nominatim API — they just format results differently.
// 'hotel' mode: name = venue name (first part of display_name), address = rest
// 'location' mode: name = city/airport name, no separate address

interface NominatimResult {
  display_name: string;
  address?: {
    aerodrome?: string;
    hotel?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    country?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
  };
  type?: string;
  class?: string;
}

async function nominatimSearch(q: string): Promise<NominatimResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
    `&format=json&limit=7&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  return res.json();
}

async function searchHotels(q: string): Promise<PlaceSuggestion[]> {
  const data = await nominatimSearch(q);
  return data.map((r) => {
    const parts = r.display_name.split(', ');
    // First segment is typically the venue name; rest is the address
    const name = parts[0];
    const address = parts.slice(1).join(', ');
    // Label: venue name + city + country for quick recognition
    const a = r.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.suburb ?? '';
    const label = [name, city, a.country].filter(Boolean).join(', ');
    return { label, name, address: address || undefined };
  });
}

async function searchLocations(q: string): Promise<PlaceSuggestion[]> {
  const data = await nominatimSearch(q);
  return data.map((r) => {
    const a = r.address ?? {};
    const place = a.aerodrome ?? a.city ?? a.town ?? a.village ?? r.display_name.split(',')[0];
    const label = [place, a.country].filter(Boolean).join(', ');
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
