import { useQuery } from '@tanstack/react-query';
import { flightsApi } from '@/api/flights';

interface Props {
  flightIata: string;       // e.g. "BA456"
  departureISO: string;     // full ISO datetime of the booking
}

function isWithin24h(iso: string): boolean {
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const diff = t - now;
    return diff > -6 * 60 * 60 * 1000 && diff < 24 * 60 * 60 * 1000; // -6h to +24h
  } catch {
    return false;
  }
}

function statusBadge(status: string, delay: number | null) {
  const delayed = delay != null && delay > 0;
  const label = delayed ? `Delayed ${delay}m` : (
    status === 'landed' ? 'Landed' :
    status === 'cancelled' ? 'Cancelled' :
    status === 'diverted' ? 'Diverted' :
    status === 'active' ? 'In the air' :
    'On time'
  );
  const colour =
    status === 'cancelled' ? 'bg-terracotta/15 text-terracotta' :
    delayed || status === 'diverted' ? 'bg-gold/15 text-gold-aged' :
    status === 'landed' ? 'bg-parchment-dark/40 text-ink-faint' :
    'bg-emerald-500/15 text-emerald-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colour}`}>
      {label}
    </span>
  );
}

export default function FlightLiveStatus({ flightIata, departureISO }: Props) {
  const imminent = isWithin24h(departureISO);
  const date = departureISO.slice(0, 10);

  const { data } = useQuery({
    queryKey: ['flight-status', flightIata, date],
    queryFn: () => flightsApi.status(flightIata, date),
    enabled: imminent && !!flightIata && !!date,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!imminent || !data) return null;

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
      {statusBadge(data.flight_status, data.departure_delay_minutes)}
      {data.departure_gate && (
        <span>Gate <span className="font-semibold text-ink">{data.departure_gate}</span></span>
      )}
    </div>
  );
}
