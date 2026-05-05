import { useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTrip } from '@/context/TripContext';
import { ACTIVITY_ICONS, type ActivityType, type ItineraryDay } from '@trip-planner-ai/shared';
import { Search, X, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const DAY_COLOURS = [
  '#2563EB', '#F97316', '#10B981', '#8B5CF6', '#EC4899',
  '#F59E0B', '#06B6D4', '#EF4444', '#64748B', '#D97706',
];

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface PinnedPlace {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

function createNumberedMarker(num: number, colour: string) {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${colour};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:Outfit,sans-serif;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25)">${num}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -18],
  });
}

function createSearchMarker() {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;border-radius:50%;background:#F97316;color:white;display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3)">📍</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  if (pos) map.flyTo(pos, 15, { duration: 1.2 });
  return null;
}

interface TripMapProps {
  selectedDayId: string | null;
  days: ItineraryDay[];
}

export default function TripMap({ selectedDayId, days }: TripMapProps) {
  const { currentTrip } = useTrip();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [pinnedPlaces, setPinnedPlaces] = useState<PinnedPlace[]>([]);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredActivities = useMemo(() => {
    return days.flatMap((day) =>
      day.activities
        .filter((a) => a.latitude && a.longitude)
        .filter(() => selectedDayId === null || day.id === selectedDayId)
        .map((a) => ({ ...a, day_number: day.day_number, day_title: day.title }))
    );
  }, [days, selectedDayId]);

  const routeLines = useMemo(() => {
    const lines: { positions: [number, number][]; colour: string }[] = [];
    const daysToShow = selectedDayId !== null ? days.filter((d) => d.id === selectedDayId) : days;
    for (const day of daysToShow) {
      const coords = day.activities
        .filter((a) => a.latitude && a.longitude)
        .map((a) => [a.latitude!, a.longitude!] as [number, number]);
      if (coords.length > 1) {
        lines.push({ positions: coords, colour: DAY_COLOURS[(day.day_number - 1) % DAY_COLOURS.length] });
      }
    }
    return lines;
  }, [days, selectedDayId]);

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 3) { setSearchResults([]); setShowResults(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=4`
        );
        const data: SearchResult[] = await res.json();
        setSearchResults(data);
        setShowResults(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
  }

  function pinResult(r: SearchResult) {
    const place: PinnedPlace = {
      id: r.place_id,
      name: r.display_name.split(',').slice(0, 2).join(', '),
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    };
    setPinnedPlaces((prev) => {
      if (prev.find((p) => p.id === r.place_id)) return prev;
      return [...prev, place];
    });
    setFlyTo([place.lat, place.lon]);
    setSearchQuery(place.name);
    setShowResults(false);
    setTimeout(() => setFlyTo(null), 2000);
  }

  function removePin(id: number) {
    setPinnedPlaces((prev) => prev.filter((p) => p.id !== id));
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  }

  function toggleSearch() {
    if (searchOpen) { clearSearch(); }
    setSearchOpen(!searchOpen);
  }

  if (!currentTrip) return null;
  const center: [number, number] = [currentTrip.latitude, currentTrip.longitude];

  return (
    <div className="space-y-2">
      {/* Pinned place chips */}
      {pinnedPlaces.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pinnedPlaces.map((p) => (
            <div key={p.id} className="flex items-center gap-1 bg-gold/10 border border-gold/30 text-gold-aged text-xs font-medium px-2 py-0.5 rounded-full">
              <MapPin size={9} />
              <span className="max-w-[120px] truncate">{p.name}</span>
              <button onClick={() => removePin(p.id)} className="text-gold-aged/60 hover:text-gold-aged ml-0.5">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search row — button + inline expanding input */}
      <div className="flex items-center justify-end gap-2 relative">
        {searchOpen && (
          <div className="relative w-44 sm:w-52">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              autoFocus
              className="vintage-input w-full pl-7 pr-7 text-xs py-1.5"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder="Search landmark…"
            />
            {searchQuery && (
              <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
                <X size={11} />
              </button>
            )}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-[1000] right-0 top-full mt-1 w-64 bg-white border border-parchment-dark rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {searchResults.map((r) => (
                  <button key={r.place_id} type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-parchment/60 border-b border-parchment-dark last:border-0 transition-colors flex items-start gap-2"
                    onMouseDown={() => pinResult(r)}>
                    <MapPin size={12} className="text-gold mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{r.display_name.split(',')[0]}</div>
                      <div className="text-xs text-ink-faint truncate">{r.display_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={toggleSearch}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex-shrink-0 ${
            searchOpen
              ? 'bg-navy text-white border-navy'
              : 'bg-white border-parchment-dark text-ink-light hover:border-navy/30'
          }`}
        >
          <Search size={12} />
          {searchOpen ? 'Close' : 'Search'}
        </button>
      </div>

      {/* Map */}
      <div className="h-[38vh] md:h-[45vh] rounded-2xl overflow-hidden border border-parchment-dark shadow-[var(--shadow-card)]">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
          <FlyTo pos={flyTo} />

          {filteredActivities.map((a, i) => (
            <Marker
              key={a.id}
              position={[a.latitude!, a.longitude!]}
              icon={createNumberedMarker(i + 1, DAY_COLOURS[(a.day_number - 1) % DAY_COLOURS.length])}
            >
              <Popup>
                <div className="font-body text-sm min-w-[160px]">
                  <div className="font-display font-bold text-navy mb-1">{a.description}</div>
                  <div className="text-ink-faint text-xs">
                    Day {a.day_number}{a.time ? ` · ${a.time.slice(0, 5)}` : ''}
                  </div>
                  {a.location_tag && <div className="text-xs mt-0.5 text-ink-light">📍 {a.location_tag}</div>}
                </div>
              </Popup>
            </Marker>
          ))}

          {pinnedPlaces.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lon]} icon={createSearchMarker()}>
              <Popup>
                <div className="font-body text-sm min-w-[140px]">
                  <div className="font-display font-bold text-gold-aged mb-1">{p.name}</div>
                  <div className="text-ink-faint text-xs">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {routeLines.map((line, i) => (
            <Polyline key={i} positions={line.positions}
              pathOptions={{ color: line.colour, weight: 3, opacity: 0.7, dashArray: '8 5' }} />
          ))}
        </MapContainer>
      </div>

      {/* Stop list */}
      {filteredActivities.length > 0 && (
        <div className="vintage-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-parchment-dark flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-ink">
              {filteredActivities.length} Stop{filteredActivities.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-ink-faint">Tap a marker for details</span>
          </div>
          <div className="divide-y divide-parchment-dark max-h-48 overflow-y-auto">
            {filteredActivities.map((a, i) => {
              const colour = DAY_COLOURS[(a.day_number - 1) % DAY_COLOURS.length];
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-parchment/50 transition-colors">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: colour }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{a.description}</p>
                    <p className="text-xs text-ink-faint">
                      Day {a.day_number}{a.time && ` · ${a.time.slice(0, 5)}`}{a.location_tag && ` · ${a.location_tag}`}
                    </p>
                  </div>
                  <span className="text-sm flex-shrink-0">{ACTIVITY_ICONS[a.type as ActivityType]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
