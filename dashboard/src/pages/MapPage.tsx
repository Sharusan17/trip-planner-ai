import { useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType } from '@trip-planner-ai/shared';
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

const DAY_COLOURS = [
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

// Helper to fly map to a position
function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  if (pos) map.flyTo(pos, 15, { duration: 1.2 });
  return null;
}

export default function MapPage() {
  const { currentTrip } = useTrip();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Landmark search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [pinnedPlaces, setPinnedPlaces] = useState<PinnedPlace[]>([]);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const filteredActivities = useMemo(() => {
    return days.flatMap((day) =>
      day.activities
        .filter((a) => a.latitude && a.longitude)
        .filter(() => selectedDay === null || day.day_number === selectedDay)
        .map((a) => ({ ...a, day_number: day.day_number, day_title: day.title }))
    );
  }, [days, selectedDay]);

  const routeLines = useMemo(() => {
    const lines: { positions: [number, number][]; colour: string }[] = [];
    const daysToShow = selectedDay !== null ? days.filter((d) => d.day_number === selectedDay) : days;
    for (const day of daysToShow) {
      const coords = day.activities
        .filter((a) => a.latitude && a.longitude)
        .map((a) => [a.latitude!, a.longitude!] as [number, number]);
      if (coords.length > 1) {
        lines.push({ positions: coords, colour: DAY_COLOURS[(day.day_number - 1) % DAY_COLOURS.length] });
      }
    }
    return lines;
  }, [days, selectedDay]);

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 3) { setSearchResults([]); setShowResults(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`
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
    // Reset flyTo after animation so it can trigger again if same place clicked
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

  if (!currentTrip) return null;
  const center: [number, number] = [currentTrip.latitude, currentTrip.longitude];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold text-navy">Map</h2>

      {/* Landmark search */}
      <div className="relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            className="vintage-input w-full pl-9 pr-9"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            placeholder="Search for a landmark or place…"
          />
          {searchQuery && (
            <button onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-[1000] left-0 right-0 top-full mt-1 bg-white border border-parchment-dark rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
            {searchResults.map((r) => (
              <button key={r.place_id} type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-parchment/60 border-b border-parchment-dark last:border-0 transition-colors flex items-start gap-2"
                onMouseDown={() => pinResult(r)}>
                <MapPin size={13} className="text-gold mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{r.display_name.split(',')[0]}</div>
                  <div className="text-xs text-ink-faint truncate">{r.display_name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pinned places chips */}
      {pinnedPlaces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pinnedPlaces.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 bg-gold/10 border border-gold/30 text-gold-aged text-xs font-medium px-2.5 py-1 rounded-full">
              <MapPin size={10} />
              <span className="max-w-[160px] truncate">{p.name}</span>
              <button onClick={() => removePin(p.id)} className="text-gold-aged/60 hover:text-gold-aged ml-0.5">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Day filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedDay(null)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
            selectedDay === null ? 'bg-navy border-navy text-white' : 'bg-white border-parchment-dark text-ink-light hover:border-navy/30'
          }`}
        >
          All Days
        </button>
        {days.map((day) => {
          const colour = DAY_COLOURS[(day.day_number - 1) % DAY_COLOURS.length];
          const isActive = selectedDay === day.day_number;
          return (
            <button key={day.day_number}
              onClick={() => setSelectedDay(day.day_number === selectedDay ? null : day.day_number)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                isActive ? 'text-white border-transparent' : 'bg-white border-parchment-dark text-ink-light hover:border-navy/30'
              }`}
              style={isActive ? { backgroundColor: colour, borderColor: colour } : {}}
            >
              Day {day.day_number}
            </button>
          );
        })}
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-parchment-dark" style={{ height: '52vh', boxShadow: 'var(--shadow-card)' }}>
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          <FlyTo pos={flyTo} />

          {/* Activity markers */}
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

          {/* Searched landmark pins */}
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

          {/* Route lines */}
          {routeLines.map((line, i) => (
            <Polyline key={i} positions={line.positions}
              pathOptions={{ color: line.colour, weight: 3, opacity: 0.7, dashArray: '8 5' }} />
          ))}
        </MapContainer>
      </div>

      {/* Stop list */}
      {filteredActivities.length > 0 ? (
        <div className="vintage-card overflow-hidden">
          <div className="px-4 py-3 border-b border-parchment-dark flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-ink">
              {filteredActivities.length} Stop{filteredActivities.length !== 1 ? 's' : ''}
            </h3>
            <span className="text-xs text-ink-faint">Tap a marker for details</span>
          </div>
          <div className="divide-y divide-parchment-dark max-h-64 overflow-y-auto">
            {filteredActivities.map((a, i) => {
              const colour = DAY_COLOURS[(a.day_number - 1) % DAY_COLOURS.length];
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-parchment/50 transition-colors">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: colour }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{a.description}</p>
                    <p className="text-xs text-ink-faint">
                      Day {a.day_number}
                      {a.time && ` · ${a.time.slice(0, 5)}`}
                      {a.location_tag && ` · ${a.location_tag}`}
                    </p>
                  </div>
                  <span className="text-base flex-shrink-0">{ACTIVITY_ICONS[a.type as ActivityType]}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="vintage-card p-8 text-center">
          <MapPin size={32} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink-light">No mapped stops</p>
          <p className="text-xs text-ink-faint mt-1">
            Use the search above to explore landmarks, or add locations when creating activities.
          </p>
        </div>
      )}
    </div>
  );
}
