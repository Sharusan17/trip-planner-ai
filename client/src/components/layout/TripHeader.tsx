import { useTrip } from '@/context/TripContext';
import { useMemo } from 'react';

export default function TripHeader() {
  const { currentTrip, activeTraveller } = useTrip();

  const countdown = useMemo(() => {
    if (!currentTrip) return null;
    const start = new Date(currentTrip.start_date);
    const now = new Date();
    const diff = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: 'Trip in progress!', days: 0, past: false, active: true };
    if (diff === 0) return { label: 'Departure day!', days: 0, past: false, active: true };
    return { label: `${diff} day${diff === 1 ? '' : 's'} to go`, days: diff, past: false, active: false };
  }, [currentTrip]);

  if (!currentTrip) return null;

  const startDate = new Date(currentTrip.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const endDate = new Date(currentTrip.end_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <header className="vintage-card map-grid p-4 mb-6">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-navy">
            {currentTrip.name}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-ink-light">
            <span>📍 {currentTrip.destination}</span>
            <span className="text-gold">•</span>
            <span>📅 {startDate} — {endDate}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {countdown && (
            <div className="text-right">
              <div className="font-display text-lg font-bold text-terracotta">
                {countdown.label}
              </div>
            </div>
          )}

          {activeTraveller && (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-parchment-light"
                style={{ backgroundColor: activeTraveller.avatar_colour }}
              >
                {activeTraveller.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-sm">
                <div className="font-display font-semibold">{activeTraveller.name}</div>
                <div className="text-xs text-ink-faint capitalize">{activeTraveller.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
