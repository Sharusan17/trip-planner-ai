import { useTrip } from '@/context/TripContext';
import { useMemo } from 'react';
import { MapPin, Calendar, Clock, Plane, Sun, Home, Menu } from 'lucide-react';
import { parseLocalDate, fmtDate } from '@/utils/date';

type CountdownState = 'before' | 'departure' | 'during' | 'arrival' | 'past';

interface Countdown {
  label: string;
  state: CountdownState;
  Icon: typeof Clock;
}

interface TripHeaderProps {
  onMenuOpen?: () => void;
}

export default function TripHeader({ onMenuOpen }: TripHeaderProps) {
  const { currentTrip } = useTrip();

  const countdown = useMemo((): Countdown | null => {
    if (!currentTrip) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = parseLocalDate(currentTrip.start_date);
    const end   = parseLocalDate(currentTrip.end_date);

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
    return null;
  }, [currentTrip]);

  if (!currentTrip) return null;

  const startDate = fmtDate(currentTrip.start_date);
  const endDate   = fmtDate(currentTrip.end_date);

  const badgeClass: Record<CountdownState, string> = {
    before:    'bg-parchment text-ink-light border border-parchment-dark',
    departure: 'bg-navy/10 text-navy border border-navy/20',
    during:    'bg-amber-50 text-amber-700 border border-amber-200',
    arrival:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
    past:      'bg-parchment text-ink-faint border border-parchment-dark',
  };

  return (
    <header className="bg-white border border-parchment-dark rounded-2xl px-4 py-3.5 mb-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        {onMenuOpen && (
          <button
            onClick={onMenuOpen}
            aria-label="Open menu"
            className="md:hidden flex-shrink-0 w-9 h-9 rounded-xl bg-[#1C1917] text-white flex items-center justify-center shadow-sm"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
        )}

        {/* Trip info */}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-ink leading-tight truncate">
            {currentTrip.name}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-0.5">
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

        {/* Countdown badge */}
        {countdown && (() => {
          const { Icon } = countdown;
          return (
            <span className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full font-body ${badgeClass[countdown.state]}`}>
              <Icon size={10} strokeWidth={2.5} />
              {countdown.label}
            </span>
          );
        })()}
      </div>
    </header>
  );
}
