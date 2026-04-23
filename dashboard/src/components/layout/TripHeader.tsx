import { useTrip } from '@/context/TripContext';
import { useMemo } from 'react';
import { MapPin, Calendar, Clock, Plane, Sun, Home } from 'lucide-react';

type CountdownState = 'before' | 'departure' | 'during' | 'arrival' | 'past';

interface Countdown {
  label: string;
  state: CountdownState;
  Icon: typeof Clock;
}

export default function TripHeader() {
  const { currentTrip, activeTraveller } = useTrip();

  const countdown = useMemo((): Countdown | null => {
    if (!currentTrip) return null;

    // Compare calendar days only (strip time) so midnight doesn't cause off-by-one
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(currentTrip.start_date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(currentTrip.end_date);
    end.setHours(0, 0, 0, 0);

    const daysToStart = Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const daysToEnd   = Math.round((end.getTime()   - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysToStart > 0) {
      return { label: `${daysToStart} day${daysToStart === 1 ? '' : 's'} to go`, state: 'before', Icon: Clock };
    }
    if (daysToStart === 0) {
      return { label: 'Departure Day', state: 'departure', Icon: Plane };
    }
    if (daysToEnd > 0) {
      return { label: 'Holiday Mode', state: 'during', Icon: Sun };
    }
    if (daysToEnd === 0) {
      return { label: 'Arrival Day', state: 'arrival', Icon: Home };
    }
    // Trip has passed — show nothing
    return null;
  }, [currentTrip]);

  if (!currentTrip) return null;

  const startDate = new Date(currentTrip.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const endDate = new Date(currentTrip.end_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <header className="bg-white border border-parchment-dark rounded-2xl px-5 py-4 mb-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Trip info */}
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink leading-tight truncate">
            {currentTrip.name}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-ink-faint">
              <MapPin size={11} strokeWidth={2} className="flex-shrink-0" />
              {currentTrip.destination}
            </span>
            <span className="flex items-center gap-1 text-xs text-ink-faint">
              <Calendar size={11} strokeWidth={2} className="flex-shrink-0" />
              {startDate} — {endDate}
            </span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {countdown && (() => {
            const badgeClass: Record<CountdownState, string> = {
              before:    'bg-parchment text-ink-light border border-parchment-dark',
              departure: 'bg-navy/10 text-navy border border-navy/20',
              during:    'bg-amber-50 text-amber-700 border border-amber-200',
              arrival:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
              past:      'bg-parchment text-ink-faint border border-parchment-dark',
            };
            const { Icon } = countdown;
            return (
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full font-body ${badgeClass[countdown.state]}`}>
                <Icon size={11} strokeWidth={2.5} />
                {countdown.label}
              </span>
            );
          })()}

          {activeTraveller && (
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm"
                style={{ backgroundColor: activeTraveller.avatar_colour }}
              >
                {activeTraveller.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-sm hidden sm:block">
                <div className="font-semibold text-ink text-sm leading-tight font-display">{activeTraveller.name}</div>
                <div className="text-xs text-ink-faint capitalize font-body">{activeTraveller.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
