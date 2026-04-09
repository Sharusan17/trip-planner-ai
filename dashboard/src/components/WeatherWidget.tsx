import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { weatherApi } from '@/api/weather';
import { Cloud, Droplets, Wind, Sun } from 'lucide-react';

const WEATHER_ICONS: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

function getIcon(code: number) {
  return WEATHER_ICONS[code] ?? '🌤️';
}

export default function WeatherWidget() {
  const { currentTrip } = useTrip();

  const { data: weather, isLoading } = useQuery({
    queryKey: ['weather', currentTrip?.latitude, currentTrip?.longitude],
    queryFn: () => weatherApi.get(currentTrip!.latitude, currentTrip!.longitude),
    enabled: !!currentTrip?.latitude,
    staleTime: 30 * 60 * 1000,
  });

  if (!currentTrip) return null;

  const tripStart = new Date(currentTrip.start_date);
  const tripEnd = new Date(currentTrip.end_date);
  tripStart.setHours(0, 0, 0, 0);
  tripEnd.setHours(23, 59, 59, 999);

  const tripDays = weather?.daily.filter((d) => {
    const date = new Date(d.date);
    return date >= tripStart && date <= tripEnd;
  }) ?? [];

  return (
    <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-parchment-dark flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sun size={16} strokeWidth={1.75} className="text-gold" />
          <h3 className="font-display text-base font-semibold text-ink">
            Weather — {currentTrip.destination}
          </h3>
        </div>
        {tripDays.length > 0 && (
          <span className="text-xs text-ink-faint font-body">
            {tripDays.length} day{tripDays.length !== 1 ? 's' : ''}
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

      {!isLoading && currentTrip.latitude && tripDays.length === 0 && (
        <div className="p-6 text-sm text-ink-faint text-center">
          No forecast available for the trip dates yet.
        </div>
      )}

      {tripDays.length > 0 && (
        <div className="overflow-x-auto">
          <div className="flex min-w-max divide-x divide-parchment-dark">
            {tripDays.map((day, i) => {
              const date = new Date(day.date);
              const isToday = new Date().toDateString() === date.toDateString();
              return (
                <div
                  key={day.date}
                  className={`flex flex-col items-center px-4 py-4 min-w-[80px] ${
                    isToday ? 'bg-blue-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-parchment/30'
                  }`}
                >
                  <span className={`text-xs font-semibold font-body uppercase tracking-wide mb-0.5 ${isToday ? 'text-navy' : 'text-ink-faint'}`}>
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
        </div>
      )}
    </div>
  );
}
