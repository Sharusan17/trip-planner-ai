import { useTrip } from '@/context/TripContext';
import { useMemo } from 'react';
import { MapPin, Calendar, Clock } from 'lucide-react';

export default function TripHeader() {
  const { currentTrip, activeTraveller } = useTrip();

  const countdown = useMemo(() => {
    if (!currentTrip) return null;
    const start = new Date(currentTrip.start_date);
    const now = new Date();
    const diff = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: 'In progress', active: true };
    if (diff === 0) return { label: 'Departure day!', active: true };
    return { label: `${diff}d to go`, active: false };
  }, [currentTrip]);

  if (!currentTrip) return null;

  const startDate = new Date(currentTrip.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const endDate = new Date(currentTrip.end_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <header className="bg-white border border-parchment-dark rounded-xl px-5 py-4 mb-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Trip info */}
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink leading-tight truncate">
            {currentTrip.name}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-sm text-ink-light">
              <MapPin size={13} strokeWidth={2} className="text-ink-faint flex-shrink-0" />
              {currentTrip.destination}
            </span>
            <span className="flex items-center gap-1 text-sm text-ink-light">
              <Calendar size={13} strokeWidth={2} className="text-ink-faint flex-shrink-0" />
              {startDate} — {endDate}
            </span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {countdown && (
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full font-body ${
              countdown.active
                ? 'bg-green-50 text-green-700'
                : 'bg-blue-50 text-navy'
            }`}>
              <Clock size={11} strokeWidth={2.5} />
              {countdown.label}
            </span>
          )}

          {activeTraveller && (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: activeTraveller.avatar_colour }}
              >
                {activeTraveller.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-sm hidden sm:block">
                <div className="font-semibold text-ink leading-tight font-display">{activeTraveller.name}</div>
                <div className="text-xs text-ink-faint capitalize font-body">{activeTraveller.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
