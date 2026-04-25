import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { weatherApi } from '@/api/weather';
import { Cloud, Droplets, Wind, Sun } from 'lucide-react';
import { parseLocalDate } from '@/utils/date';

const WEATHER_ICONS: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

interface WeatherTag { label: string; className: string }
const WEATHER_TAGS: Record<number, WeatherTag> = {
  0:  { label: 'Sunny',  className: 'bg-amber-100 text-amber-700' },
  1:  { label: 'Sunny',  className: 'bg-amber-100 text-amber-700' },
  2:  { label: 'Cloudy', className: 'bg-slate-100 text-slate-600' },
  3:  { label: 'Cloudy', className: 'bg-slate-100 text-slate-600' },
  45: { label: 'Foggy',  className: 'bg-slate-100 text-slate-500' },
  48: { label: 'Foggy',  className: 'bg-slate-100 text-slate-500' },
  51: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  53: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  55: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  61: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  63: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  65: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  71: { label: 'Snowy',  className: 'bg-sky-100 text-sky-600' },
  73: { label: 'Snowy',  className: 'bg-sky-100 text-sky-600' },
  75: { label: 'Snowy',  className: 'bg-sky-100 text-sky-600' },
  80: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  81: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  82: { label: 'Rainy',  className: 'bg-blue-100 text-blue-700' },
  95: { label: 'Stormy', className: 'bg-red-100 text-red-700' },
  96: { label: 'Stormy', className: 'bg-red-100 text-red-700' },
  99: { label: 'Stormy', className: 'bg-red-100 text-red-700' },
};

function getIcon(code: number) {
  return WEATHER_ICONS[code] ?? '🌤️';
}
function getTag(code: number): WeatherTag {
  return WEATHER_TAGS[code] ?? { label: 'Cloudy', className: 'bg-slate-100 text-slate-600' };
}

export default function WeatherWidget() {
  const { currentTrip } = useTrip();

  const { data: weather, isLoading } = useQuery({
    queryKey: ['weather', currentTrip?.latitude, currentTrip?.longitude],
    queryFn: () => weatherApi.get(currentTrip!.latitude, currentTrip!.longitude),
    enabled: !!currentTrip?.latitude,
    staleTime:           2 * 60 * 60 * 1000,  // 2 h — matches server cache TTL
    gcTime:              4 * 60 * 60 * 1000,  // keep in memory 4 h after last use
    refetchOnWindowFocus: false,               // don't re-hit on tab switch
    refetchOnReconnect:   false,               // don't re-hit on network reconnect
    retry: false,                              // don't retry on 429 — server handles stale
  });

  if (!currentTrip) return null;

  const tripStart = parseLocalDate(currentTrip.start_date);
  const tripEnd   = parseLocalDate(currentTrip.end_date);

  // All 7 forecast days; mark which ones fall within the trip window
  const forecastDays = weather?.daily ?? [];

  return (
    <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-parchment-dark flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sun size={16} strokeWidth={1.75} className="text-gold" />
          <h3 className="font-display text-base font-semibold text-ink">
            Weather — {currentTrip.destination}
          </h3>
        </div>
        {forecastDays.length > 0 && (
          <span className="text-xs text-ink-faint font-body">
            {forecastDays.length}-day forecast
          </span>
        )}
      </div>

      {isLoading && (
        <div className="p-6 flex items-center gap-2 text-ink-faint text-sm">
          <Cloud size={16} className="animate-pulse" />
          Loading forecast…
        </div>
      )}

      {!isLoading && !currentTrip.latitude && (
        <div className="p-6 text-sm text-ink-faint text-center">
          No location set — add a destination with coordinates to see weather.
        </div>
      )}

      {!isLoading && currentTrip.latitude && forecastDays.length === 0 && (
        <div className="p-6 text-sm text-ink-faint text-center">
          No forecast available yet.
        </div>
      )}

      {forecastDays.length > 0 && (
        <div className="grid divide-x divide-parchment-dark"
          style={{ gridTemplateColumns: `repeat(${forecastDays.length}, 1fr)` }}
        >
          {forecastDays.map((day) => {
            const date = parseLocalDate(day.date);
            const todayMidnight = (() => { const t = new Date(); t.setHours(0,0,0,0); return t; })();
            const isToday   = date.getTime() === todayMidnight.getTime();
            const isTripDay = date >= tripStart && date <= tripEnd;

            return (
              <div
                key={day.date}
                className={`flex flex-col items-center px-1 py-4 ${
                  isToday   ? 'bg-navy/5' :
                  isTripDay ? 'bg-amber-50/40' :
                              'bg-white'
                }`}
              >
                <span className={`text-[11px] font-semibold font-body uppercase tracking-wide mb-0.5 ${
                  isToday ? 'text-navy' : isTripDay ? 'text-amber-700' : 'text-ink-faint'
                }`}>
                  {isToday ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span className="text-[10px] text-ink-faint font-body mb-2">
                  {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>

                <span className="text-2xl mb-2 leading-none">{getIcon(day.weather_code)}</span>

                <span className="font-display text-sm font-bold text-ink">
                  {Math.round(day.temperature_max)}°
                </span>
                <span className="text-xs text-ink-faint">
                  {Math.round(day.temperature_min)}°
                </span>

                {/* Condition tag */}
                {(() => {
                  const tag = getTag(day.weather_code);
                  return (
                    <span className={`mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold font-body leading-none ${tag.className}`}>
                      {tag.label}
                    </span>
                  );
                })()}

                {day.precipitation_probability > 0 && (
                  <div className="flex items-center gap-0.5 mt-1.5">
                    <Droplets size={10} className="text-blue-400" />
                    <span className="text-[10px] text-blue-500 font-body">
                      {day.precipitation_probability}%
                    </span>
                  </div>
                )}

                {day.wind_speed_max > 20 && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <Wind size={10} className="text-ink-faint" />
                    <span className="text-[10px] text-ink-faint font-body">
                      {Math.round(day.wind_speed_max)}km/h
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
