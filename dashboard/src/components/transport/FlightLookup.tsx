import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plane, Search, Loader2 } from 'lucide-react';
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

function minutesBetween(hhmmA: string, hhmmB: string): number {
  if (!hhmmA || !hhmmB) return 0;
  const [aH, aM] = hhmmA.split(':').map(Number);
  const [bH, bM] = hhmmB.split(':').map(Number);
  let diff = (bH * 60 + bM) - (aH * 60 + aM);
  if (diff < 0) diff += 24 * 60; // handle crossing midnight
  return diff;
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

  useEffect(() => {
    const normalised = normaliseIata(flightNumber);
    // IATA airline codes are 2 alphanumeric chars (e.g. W9 Wizz Air, U2 easyJet, BA British Airways).
    // ICAO codes are 3 letters (e.g. BAW). Followed by 1-4 digit flight number and optional suffix letter.
    if (normalised.length < 3 || !/^([A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/.test(normalised)) {
      setDebouncedIata('');
      return;
    }
    const t = setTimeout(() => setDebouncedIata(normalised), 500);
    return () => clearTimeout(t);
  }, [flightNumber]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['flight-lookup', debouncedIata],
    queryFn: () => flightsApi.lookup(debouncedIata),
    enabled: debouncedIata.length >= 3,
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
        {debouncedIata} not found in recent history. Enter details manually.
      </p>
    );
  }

  const headline = groups.length === 1
    ? `Recent ${debouncedIata} schedule${bookingDateLabel ? ` — use as template for ${bookingDateLabel}` : ''}`
    : `Recent ${debouncedIata} schedules — pick one${bookingDateLabel ? ` for ${bookingDateLabel}` : ''}`;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider">{headline}</p>
      {groups.map((g) => {
        const mins = minutesBetween(g.sample.departure_time_local, g.sample.arrival_time_local);
        const fromLabel = `${g.sample.departure_airport} (${g.sample.departure_iata})`;
        const toLabel = `${g.sample.arrival_airport} (${g.sample.arrival_iata})`;
        return (
          <button
            key={g.signature}
            type="button"
            onClick={() => onAutoFill({
              airline: g.sample.airline,
              from_location: fromLabel,
              to_location: toLabel,
              departure_terminal: g.sample.departure_terminal,
              arrival_terminal: g.sample.arrival_terminal,
              aircraft_type: g.sample.aircraft_type,
              departure_time_hhmm: g.sample.departure_time_local,
              arrival_time_hhmm: g.sample.arrival_time_local,
            })}
            className="w-full text-left rounded-xl border border-parchment-dark bg-white hover:border-navy hover:bg-navy/5 transition-colors p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <Plane size={14} className="text-navy" strokeWidth={2} />
              <span className="text-sm font-semibold text-ink">{g.sample.airline || debouncedIata}</span>
            </div>
            <div className="text-sm text-ink">
              {g.sample.departure_iata}{g.sample.departure_terminal ? ` T${g.sample.departure_terminal}` : ''}
              {' → '}
              {g.sample.arrival_iata}{g.sample.arrival_terminal ? ` T${g.sample.arrival_terminal}` : ''}
            </div>
            <div className="text-xs text-ink-faint mt-0.5">
              {g.sample.departure_time_local} → {g.sample.arrival_time_local}
              {mins > 0 && ` · ${formatDuration(mins)}`}
              {g.sample.aircraft_type && ` · ${g.sample.aircraft_type}`}
            </div>
            <div className="text-xs text-ink-faint mt-1">
              Flown on: {g.days.join(', ')}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-navy font-medium">
              <Search size={12} strokeWidth={2} /> Use this schedule
            </div>
          </button>
        );
      })}
    </div>
  );
}
