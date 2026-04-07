import { useTrip } from '@/context/TripContext';
import { useQuery } from '@tanstack/react-query';
import { travellersApi } from '@/api/travellers';
import { itineraryApi } from '@/api/itinerary';
import { weatherApi } from '@/api/weather';
import { QRCodeSVG } from 'qrcode.react';

export default function DashboardPage() {
  const { currentTrip, isOrganiser } = useTrip();

  const { data: travellers } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: days } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: weather } = useQuery({
    queryKey: ['weather', currentTrip?.latitude, currentTrip?.longitude],
    queryFn: () => weatherApi.get(currentTrip!.latitude, currentTrip!.longitude),
    enabled: !!currentTrip && !!currentTrip.latitude,
    staleTime: 30 * 60 * 1000,
  });

  if (!currentTrip) return null;

  const totalActivities = days?.reduce((sum, d) => sum + d.activities.length, 0) ?? 0;
  const todayWeather = weather?.daily?.[0];
  const shareUrl = `${window.location.origin}/?code=${currentTrip.group_code}`;

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="vintage-card p-4 text-center">
          <div className="text-3xl mb-1">👥</div>
          <div className="font-display text-2xl font-bold text-navy">{travellers?.length ?? 0}</div>
          <div className="text-xs text-ink-faint font-display">Travellers</div>
        </div>
        <div className="vintage-card p-4 text-center">
          <div className="text-3xl mb-1">📅</div>
          <div className="font-display text-2xl font-bold text-navy">{days?.length ?? 0}</div>
          <div className="text-xs text-ink-faint font-display">Days Planned</div>
        </div>
        <div className="vintage-card p-4 text-center">
          <div className="text-3xl mb-1">📌</div>
          <div className="font-display text-2xl font-bold text-navy">{totalActivities}</div>
          <div className="text-xs text-ink-faint font-display">Activities</div>
        </div>
        <div className="vintage-card p-4 text-center">
          <div className="text-3xl mb-1">{todayWeather ? '☀️' : '🌤️'}</div>
          <div className="font-display text-2xl font-bold text-navy">
            {todayWeather ? `${Math.round(todayWeather.temperature_max)}°` : '--'}
          </div>
          <div className="text-xs text-ink-faint font-display">Today's High</div>
        </div>
      </div>

      {/* Group code & QR */}
      <div className="vintage-card map-grid p-6">
        <div className="relative z-10">
          <h3 className="font-display text-lg font-bold text-navy mb-3">Share This Trip</h3>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="text-center">
              <div className="bg-white p-3 rounded-sm inline-block mb-2">
                <QRCodeSVG
                  value={shareUrl}
                  size={140}
                  fgColor="#1B3A5C"
                  bgColor="#FFFFFF"
                />
              </div>
              <p className="text-xs text-ink-faint">Scan to join</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-ink-light mb-2">Or share the group code:</p>
              <div className="flex items-center gap-2">
                <code className="bg-navy text-gold-light text-2xl tracking-[0.3em] font-mono px-4 py-2 rounded-sm">
                  {currentTrip.group_code}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(currentTrip.group_code)}
                  className="btn-secondary text-sm py-2"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-ink-faint mt-3">
                Members can join at {window.location.origin} using this code
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Travellers preview */}
      {travellers && travellers.length > 0 && (
        <div className="vintage-card p-6">
          <h3 className="font-display text-lg font-bold text-navy mb-3">Travellers</h3>
          <div className="flex flex-wrap gap-3">
            {travellers.map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-parchment-dark/50 px-3 py-1.5 rounded-sm">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-parchment-light"
                  style={{ backgroundColor: t.avatar_colour }}
                >
                  {t.name.charAt(0)}
                </div>
                <span className="text-sm font-display">{t.name}</span>
                <span className={`badge text-[10px] ${t.type === 'child' ? 'badge-gold' : t.type === 'infant' ? 'badge-terracotta' : 'badge-navy'}`}>
                  {t.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming activities */}
      {days && days.length > 0 && (
        <div className="vintage-card p-6">
          <h3 className="font-display text-lg font-bold text-navy mb-3">Upcoming Days</h3>
          <div className="space-y-2">
            {days.slice(0, 3).map((day) => (
              <div key={day.id} className="flex items-center gap-3 p-3 bg-parchment-dark/30 rounded-sm">
                <div className="font-display text-sm font-bold text-terracotta min-w-[60px]">
                  Day {day.day_number}
                </div>
                <div className="flex-1">
                  <div className="font-display text-sm font-semibold">
                    {day.title || `Day ${day.day_number}`}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {day.activities.length} activit{day.activities.length === 1 ? 'y' : 'ies'}
                  </div>
                </div>
                <div className="text-xs text-ink-faint">
                  {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
