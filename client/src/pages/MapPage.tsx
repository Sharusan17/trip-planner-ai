import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType } from '@trip-planner-ai/shared';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issue with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function createEmojiIcon(emoji: string) {
  return L.divIcon({
    html: `<div style="font-size:24px;text-align:center;line-height:1">${emoji}</div>`,
    className: 'emoji-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

const DAY_COLOURS = [
  '#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A',
  '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574',
];

export default function MapPage() {
  const { currentTrip } = useTrip();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<ActivityType>>(new Set(Object.keys(ACTIVITY_ICONS) as ActivityType[]));

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const filteredActivities = useMemo(() => {
    return days.flatMap((day) =>
      day.activities
        .filter((a) => a.latitude && a.longitude)
        .filter((a) => activeCategories.has(a.type))
        .filter(() => selectedDay === null || day.day_number === selectedDay)
        .map((a) => ({ ...a, day_number: day.day_number, day_title: day.title }))
    );
  }, [days, selectedDay, activeCategories]);

  const routeLines = useMemo(() => {
    const lines: { positions: [number, number][]; colour: string }[] = [];
    const daysToShow = selectedDay !== null ? days.filter((d) => d.day_number === selectedDay) : days;

    for (const day of daysToShow) {
      const coords = day.activities
        .filter((a) => a.latitude && a.longitude)
        .filter((a) => activeCategories.has(a.type))
        .map((a) => [a.latitude!, a.longitude!] as [number, number]);

      if (coords.length > 1) {
        lines.push({
          positions: coords,
          colour: DAY_COLOURS[(day.day_number - 1) % DAY_COLOURS.length],
        });
      }
    }
    return lines;
  }, [days, selectedDay, activeCategories]);

  const toggleCategory = (cat: ActivityType) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!currentTrip) return null;

  const center: [number, number] = [currentTrip.latitude, currentTrip.longitude];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold text-navy">Map</h2>

      {/* Day scrubber */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedDay(null)}
          className={`px-3 py-1.5 rounded-sm text-sm font-display whitespace-nowrap transition-all ${
            selectedDay === null ? 'bg-navy text-parchment-light' : 'bg-parchment-dark/50 text-ink-light hover:bg-parchment-dark'
          }`}
        >
          All Days
        </button>
        {days.map((day) => (
          <button
            key={day.day_number}
            onClick={() => setSelectedDay(day.day_number === selectedDay ? null : day.day_number)}
            className={`px-3 py-1.5 rounded-sm text-sm font-display whitespace-nowrap transition-all ${
              selectedDay === day.day_number ? 'bg-navy text-parchment-light' : 'bg-parchment-dark/50 text-ink-light hover:bg-parchment-dark'
            }`}
          >
            Day {day.day_number}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(ACTIVITY_ICONS) as ActivityType[]).map((cat) => (
          <button
            key={cat}
            onClick={() => toggleCategory(cat)}
            className={`px-2 py-1 rounded-sm text-xs font-display transition-all ${
              activeCategories.has(cat) ? 'bg-gold/20 text-ink border border-gold/40' : 'bg-parchment-dark/30 text-ink-faint line-through'
            }`}
          >
            {ACTIVITY_ICONS[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="vintage-card overflow-hidden" style={{ height: '60vh' }}>
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredActivities.map((a) => (
            <Marker
              key={a.id}
              position={[a.latitude!, a.longitude!]}
              icon={createEmojiIcon(ACTIVITY_ICONS[a.type])}
            >
              <Popup>
                <div className="font-body text-sm">
                  <div className="font-display font-bold text-navy">{a.description}</div>
                  <div className="text-ink-faint text-xs mt-1">
                    Day {a.day_number} {a.time && `· ${a.time.slice(0, 5)}`}
                  </div>
                  {a.location_tag && <div className="text-xs mt-0.5">📍 {a.location_tag}</div>}
                  {a.kid_friendly && <div className="text-xs mt-0.5">👶 Kid-friendly</div>}
                </div>
              </Popup>
            </Marker>
          ))}

          {routeLines.map((line, i) => (
            <Polyline
              key={i}
              positions={line.positions}
              pathOptions={{ color: line.colour, weight: 3, opacity: 0.6, dashArray: '8 4' }}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
