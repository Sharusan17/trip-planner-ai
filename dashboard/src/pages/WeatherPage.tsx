import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { weatherApi } from '@/api/weather';

const WEATHER_ICONS: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

function getWeatherIcon(code: number): string {
  return WEATHER_ICONS[code] || '🌤️';
}

export default function WeatherPage() {
  const { currentTrip } = useTrip();

  const { data: weather, isLoading, error } = useQuery({
    queryKey: ['weather', currentTrip?.latitude, currentTrip?.longitude],
    queryFn: () => weatherApi.get(currentTrip!.latitude, currentTrip!.longitude),
    enabled: !!currentTrip && !!currentTrip.latitude,
    staleTime: 30 * 60 * 1000,
  });

  if (!currentTrip) return null;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-navy">
        Weather — {currentTrip.destination}
      </h2>

      {isLoading && (
        <div className="vintage-card p-12 text-center text-ink-faint">Loading weather data...</div>
      )}

      {error && (
        <div className="vintage-card p-6 text-center text-terracotta">
          Failed to load weather data. Check your internet connection.
        </div>
      )}

      {weather && (
        <>
          {/* 7-day forecast */}
          <div>
            <h3 className="font-display text-lg font-semibold text-navy mb-3">7-Day Forecast</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weather.daily.map((day, i) => (
                <div key={day.date} className={`vintage-card p-4 text-center ${i === 0 ? 'border-navy/40' : ''}`}>
                  <div className="text-xs text-ink-faint font-display mb-1">
                    {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short' })}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-3xl my-2">{getWeatherIcon(day.weather_code)}</div>
                  <div className="font-display font-bold text-navy">{Math.round(day.temperature_max)}°</div>
                  <div className="text-sm text-ink-faint">{Math.round(day.temperature_min)}°</div>
                  <div className="text-xs text-ink-faint mt-1">
                    💧 {day.precipitation_probability}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's hourly */}
          <div>
            <h3 className="font-display text-lg font-semibold text-navy mb-3">Today Hourly</h3>
            <div className="vintage-card p-4 overflow-x-auto">
              <div className="flex gap-4 min-w-max">
                {weather.hourly.map((h) => {
                  const hour = new Date(h.time).getHours();
                  return (
                    <div key={h.time} className="text-center min-w-[50px]">
                      <div className="text-xs text-ink-faint font-mono">{hour}:00</div>
                      <div className="text-xl my-1">{getWeatherIcon(h.weather_code)}</div>
                      <div className="text-sm font-display font-semibold">{Math.round(h.temperature)}°</div>
                      <div className="text-[10px] text-ink-faint">💧{h.precipitation_probability}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sun & UV */}
          {weather.daily[0] && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="vintage-card p-5">
                <h3 className="font-display text-lg font-semibold text-navy mb-3">Sun & UV</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>🌅 Sunrise</span>
                    <span className="font-mono">{new Date(weather.daily[0].sunrise).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🌇 Sunset</span>
                    <span className="font-mono">{new Date(weather.daily[0].sunset).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>☀️ UV Index</span>
                    <span className="font-mono font-bold">{weather.daily[0].uv_index_max}</span>
                  </div>
                  <div className="mt-2 p-2 bg-gold/10 rounded-sm text-xs">
                    {weather.daily[0].uv_index_max >= 8
                      ? '⚠️ Very high UV — SPF 50+, reapply every 90 mins. Keep infants in shade.'
                      : weather.daily[0].uv_index_max >= 6
                      ? '⚠️ High UV — SPF 50, reapply every 2 hours.'
                      : weather.daily[0].uv_index_max >= 3
                      ? 'Moderate UV — SPF 30 recommended.'
                      : 'Low UV — SPF 15 sufficient.'}
                  </div>
                </div>
              </div>

              {/* Beach conditions */}
              {weather.beach && (
                <div className="vintage-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-display text-lg font-semibold text-navy">Beach Conditions</h3>
                    <span className={`inline-block w-4 h-4 rounded-full ${
                      weather.beach.beach_flag === 'green' ? 'bg-green-500' :
                      weather.beach.beach_flag === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'
                    }`} title={`${weather.beach.beach_flag} flag`} />
                  </div>
                  <div className="space-y-2 text-sm">
                    {weather.beach.sea_surface_temperature !== null && (
                      <div className="flex justify-between">
                        <span>🌊 Sea Temperature</span>
                        <span className="font-mono">{weather.beach.sea_surface_temperature}°C</span>
                      </div>
                    )}
                    {weather.beach.wave_height !== null && (
                      <div className="flex justify-between">
                        <span>🌊 Wave Height</span>
                        <span className="font-mono">{weather.beach.wave_height}m</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>💨 Wind</span>
                      <span className="font-mono">{weather.beach.wind_speed} km/h</span>
                    </div>
                    <div className="mt-2 p-2 bg-gold/10 rounded-sm text-xs">
                      🧴 {weather.beach.spf_recommendation}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
