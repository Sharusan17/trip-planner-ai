import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType } from '@trip-planner-ai/shared';
import { Map } from 'lucide-react';
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

function createNumberedMarker(num: number, colour: string) {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${colour};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:Outfit,sans-serif;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25)">${num}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -18],
  });
}

export default function MapPage() {
  const { currentTrip } = useTrip();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
        lines.push({
          positions: coords,
          colour: DAY_COLOURS[(day.day_number - 1) % DAY_COLOURS.length],
        });
      }
    }
    return lines;
  }, [days, selectedDay]);

  if (!currentTrip) return null;

  const center: [number, number] = [currentTrip.latitude, currentTrip.longitude];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold text-navy">Map</h2>

      {/* Day filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedDay(null)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
            selectedDay === null
              ? 'bg-navy border-navy text-white'
              : 'bg-white border-parchment-dark text-ink-light hover:border-navy/30'
          }`}
        >
          All Days
        </button>
        {days.map((day) => {
          const colour = DAY_COLOURS[(day.day_number - 1) % DAY_COLOURS.length];
          const isActive = selectedDay === day.day_number;
          return (
            <button
              key={day.day_number}
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
      <div
        className="rounded-2xl overflow-hidden border border-parchment-dark"
        style={{ height: '55vh', boxShadow: 'var(--shadow-card)' }}
      >
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

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

          {routeLines.map((line, i) => (
            <Polyline
              key={i}
              positions={line.positions}
              pathOptions={{ color: line.colour, weight: 3, opacity: 0.7, dashArray: '8 5' }}
            />
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
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: colour }}
                  >
                    {i + 1}
                  </div>
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
          <Map size={32} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink-light">No mapped stops</p>
          <p className="text-xs text-ink-faint mt-1">Add latitude & longitude to activities to see them here.</p>
        </div>
      )}
    </div>
  );
}
