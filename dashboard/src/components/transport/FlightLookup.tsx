import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plane, Loader2, Check, Clock, CalendarClock } from 'lucide-react';
import { flightsApi, type FlightInstance } from '@/api/flights';

export interface FlightAutoFill {
  airline: string;
  from_location: string;
  to_location: string;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  aircraft_type: string | null;
  departure_time_hhmm: string;
  arrival_time_hhmm: string;
}

interface Props {
  flightNumber: string;
  bookingDate: string; // YYYY-MM-DD (may be empty)
  onAutoFill: (data: FlightAutoFill) => void;
}

interface ScheduleGroup {
  signature: string;
  instances: FlightInstance[];
  days: string[]; // e.g. ['Mon','Tue','Wed']
  sample: FlightInstance;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNameFromISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return DAY_NAMES[d.getUTCDay()];
}

function normaliseIata(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function minutesBetween(hhmmA: string, hhmmB: string): { minutes: number; crossesMidnight: boolean } {
  if (!hhmmA || !hhmmB) return { minutes: 0, crossesMidnight: false };
  const [aH, aM] = hhmmA.split(':').map(Number);
  const [bH, bM] = hhmmB.split(':').map(Number);
  let diff = (bH * 60 + bM) - (aH * 60 + aM);
  let crossesMidnight = false;
  if (diff < 0) {
    diff += 24 * 60;
    crossesMidnight = true;
  }
  return { minutes: diff, crossesMidnight };
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function groupBySchedule(instances: FlightInstance[]): ScheduleGroup[] {
  const groups = new Map<string, ScheduleGroup>();
  for (const inst of instances) {
    const sig = `${inst.departure_iata}|${inst.arrival_iata}|${inst.departure_time_local}|${inst.arrival_time_local}|${inst.departure_terminal ?? ''}|${inst.arrival_terminal ?? ''}`;
    const existing = groups.get(sig);
    if (existing) {
      existing.instances.push(inst);
      const day = dayNameFromISO(inst.flight_date);
      if (!existing.days.includes(day)) existing.days.push(day);
    } else {
      groups.set(sig, {
        signature: sig,
        instances: [inst],
        days: [dayNameFromISO(inst.flight_date)],
        sample: inst,
      });
    }
  }
  return Array.from(groups.values());
}

export default function FlightLookup({ flightNumber, bookingDate, onAutoFill }: Props) {
  const [debouncedIata, setDebouncedIata] = useState('');
  const [selectedSignature, setSelectedSignature] = useState<string>('');

  useEffect(() => {
    const normalised = normaliseIata(flightNumber);
    // IATA airline codes are 2 alphanumeric chars (e.g. W9 Wizz Air, U2 easyJet, BA British Airways).
    // ICAO codes are 3 letters (e.g. BAW). Followed by 1-4 digit flight number and optional suffix letter.
    if (normalised.length < 3 || !/^([A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/.test(normalised)) {
      setDebouncedIata('');
      setSelectedSignature('');
      return;
    }
    const t = setTimeout(() => setDebouncedIata(normalised), 500);
    return () => clearTimeout(t);
  }, [flightNumber]);

  // Reset selection when lookup key changes
  useEffect(() => {
    setSelectedSignature('');
  }, [debouncedIata, bookingDate]);

  // Only run the lookup once a booking date is set — the API needs it to return
  // the right daily schedule, and it prevents wasted calls if the user is still
  // filling in the form.
  const hasBookingDate = /^\d{4}-\d{2}-\d{2}$/.test(bookingDate);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['flight-lookup', debouncedIata, bookingDate],
    queryFn: () => flightsApi.lookup(debouncedIata, bookingDate || undefined),
    enabled: debouncedIata.length >= 3 && hasBookingDate,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const groups = useMemo(() => (data ? groupBySchedule(data) : []), [data]);

  const bookingDateLabel = useMemo(() => {
    if (!bookingDate) return '';
    try {
      return new Date(`${bookingDate}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      });
    } catch {
      return '';
    }
  }, [bookingDate]);

  if (!debouncedIata) return null;

  // Prompt for date before hitting the API — most graceful failure mode.
  if (!hasBookingDate) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-ink">
        <CalendarClock size={14} className="text-gold shrink-0 mt-0.5" strokeWidth={2} />
        <span>
          <span className="font-semibold">Set a departure date first.</span>{' '}
          Flight schedules depend on the day — add the departure date above to look up {debouncedIata}.
        </span>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-faint mt-2">
        <Loader2 size={14} className="animate-spin" />
        Looking up {debouncedIata}…
      </div>
    );
  }

  if (error) {
    const msg = (error as Error).message?.toLowerCase() ?? '';
    if (msg.includes('not configured')) {
      return (
        <p className="text-xs text-ink-faint mt-2">
          Flight lookup unavailable. Enter details manually.
        </p>
      );
    }
    return (
      <p className="text-xs text-ink-faint mt-2">
        Flight lookup temporarily unavailable. Enter details manually.
      </p>
    );
  }

  if (!groups.length) {
    return (
      <p className="text-xs text-ink-faint mt-2">
        {debouncedIata} isn't currently tracked. Enter details manually.
      </p>
    );
  }

  const headline = bookingDateLabel
    ? `${debouncedIata} on ${bookingDateLabel}`
    : debouncedIata;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider">{headline}</p>
      {groups.map((g) => {
        const { minutes, crossesMidnight } = minutesBetween(
          g.sample.departure_time_local,
          g.sample.arrival_time_local,
        );
        const isSelected = selectedSignature === g.signature;
        const fromLabel = `${g.sample.departure_airport} (${g.sample.departure_iata})`;
        const toLabel = `${g.sample.arrival_airport} (${g.sample.arrival_iata})`;

        const handleSelect = () => {
          setSelectedSignature(g.signature);
          onAutoFill({
            airline: g.sample.airline,
            from_location: fromLabel,
            to_location: toLabel,
            departure_terminal: g.sample.departure_terminal,
            arrival_terminal: g.sample.arrival_terminal,
            aircraft_type: g.sample.aircraft_type,
            departure_time_hhmm: g.sample.departure_time_local,
            arrival_time_hhmm: g.sample.arrival_time_local,
          });
        };

        return (
          <button
            key={g.signature}
            type="button"
            onClick={handleSelect}
            aria-pressed={isSelected}
            className={[
              'w-full text-left rounded-xl p-3 transition-all',
              isSelected
                ? 'border-2 border-navy bg-navy/5 ring-2 ring-navy/20 shadow-sm'
                : 'border border-parchment-dark bg-white hover:border-navy hover:bg-navy/5',
            ].join(' ')}
          >
            {/* Row 1: airline name (left) + selected check (right) */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Plane size={14} className="text-navy shrink-0" strokeWidth={2} />
                <span className="text-sm font-semibold text-ink truncate">
                  {g.sample.airline || debouncedIata}
                </span>
              </div>
              {isSelected ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-navy shrink-0">
                  <Check size={14} strokeWidth={3} />
                  Selected
                </span>
              ) : (
                <span className="text-xs text-ink-faint shrink-0">Tap to select</span>
              )}
            </div>

            {/* Row 2: route (left, each airport with terminal stacked underneath) + times (right) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col">
                  <span className="text-base font-bold text-ink leading-tight">{g.sample.departure_iata}</span>
                  {g.sample.departure_terminal && (
                    <span className="text-[10px] text-ink-faint leading-tight mt-0.5">
                      Terminal {g.sample.departure_terminal}
                    </span>
                  )}
                </div>
                <span className="text-ink-faint text-base leading-tight">→</span>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-ink leading-tight">{g.sample.arrival_iata}</span>
                  {g.sample.arrival_terminal && (
                    <span className="text-[10px] text-ink-faint leading-tight mt-0.5">
                      Terminal {g.sample.arrival_terminal}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-ink">
                  {g.sample.departure_time_local}
                  <span className="text-ink-faint mx-1">→</span>
                  {g.sample.arrival_time_local}
                  {crossesMidnight && (
                    <sup className="text-xs text-gold ml-0.5" title="Arrives next day">+1</sup>
                  )}
                </div>
                {minutes > 0 && (
                  <div className="flex items-center justify-end gap-1 text-xs text-ink-faint mt-0.5">
                    <Clock size={11} strokeWidth={2} />
                    {formatDuration(minutes)}
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: extra details (aircraft, multi-day schedule) */}
            {(g.sample.aircraft_type || g.days.length > 1) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint mt-1.5">
                {g.sample.aircraft_type && (
                  <span>Aircraft: {g.sample.aircraft_type}</span>
                )}
                {g.days.length > 1 && (
                  <span>Flown on: {g.days.join(', ')}</span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
