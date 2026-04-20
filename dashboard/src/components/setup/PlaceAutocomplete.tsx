import { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { searchHotels, searchLocations, searchPOIs, searchAirports } from '@/utils/placeSearch';
import type { PlaceSuggestion } from '@/utils/placeSearch';

export type { PlaceSuggestion };

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  placeholder?: string;
  className?: string;
  /**
   * hotel    — LiteAPI hotel database (Photon fallback); populates address field
   * location — Nominatim cities / stations / general places
   * airport  — LiteAPI airport IATA search (Nominatim fallback); best for flights
   * poi      — Photon named POIs (restaurants, beaches, museums, attractions)
   */
  searchType?: 'hotel' | 'location' | 'airport' | 'poi';
}

const SEARCH_FN: Record<string, (q: string) => Promise<PlaceSuggestion[]>> = {
  hotel:    searchHotels,
  location: searchLocations,
  airport:  searchAirports,
  poi:      searchPOIs,
};

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
    const fn = SEARCH_FN[searchType];
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fn(value);
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
