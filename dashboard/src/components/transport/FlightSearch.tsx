import { useState } from 'react';
import { Loader2, Search, Plane, AlertCircle } from 'lucide-react';

export interface FlightAutoFill {
  from_location?: string;
  to_location?: string;
  departure_time?: string;
  arrival_time?: string;
  reference_number?: string;
  airline?: string;
}

interface FlightResult {
  flightNumber: string;
  airline: string;
  from_location: string;
  to_location: string;
  departure_time?: string;
  arrival_time?: string;
  status: string;
}

interface Props {
  /** Current flight number / PNR entered in the reference field */
  flightNumber: string;
  /** IATA code parsed from from_location, e.g. "LHR" */
  fromIata: string;
  /** IATA code parsed from to_location, e.g. "FAO" */
  toIata: string;
  /** Date part of departure_time, e.g. "2024-07-15" */
  departureDate: string;
  onAutoFill: (data: FlightAutoFill) => void;
}

/** Extract IATA code from strings like "London Heathrow Airport (LHR)" or plain "LHR" */
export function parseIata(location: string): string {
  const match = location.match(/\(([A-Z]{3})\)/);
  if (match) return match[1];
  const trimmed = location.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  return '';
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function FlightSearch({
  flightNumber,
  fromIata,
  toIata,
  departureDate,
  onAutoFill,
}: Props) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<FlightResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const canLookup = flightNumber.trim().length >= 4;
  const canSearch = fromIata.length === 3 && toIata.length === 3;

  async function handleLookup() {
    setError(null);
    setResults([]);
    setSearched(false);
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/v1/flights/lookup?iata=${encodeURIComponent(flightNumber.trim().toUpperCase())}`);
      if (res.status === 404) {
        setError("Flight not found in live feed — it may be too far in the future. Enter times manually.");
        return;
      }
      if (!res.ok) throw new Error('Lookup failed');
      const data: FlightResult = await res.json();
      onAutoFill({
        from_location:  data.from_location,
        to_location:    data.to_location,
        departure_time: data.departure_time,
        arrival_time:   data.arrival_time,
        reference_number: data.flightNumber,
        airline:        data.airline,
      });
      setError(null);
    } catch {
      setError('Could not look up flight. Check the flight number and try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleRouteSearch() {
    setError(null);
    setResults([]);
    setSearched(true);
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ dep: fromIata, arr: toIata });
      if (departureDate) params.set('date', departureDate);
      const res = await fetch(`/api/v1/flights/search?${params}`);
      if (!res.ok) throw new Error('Search failed');
      const data: FlightResult[] = await res.json();
      setResults(data);
      if (data.length === 0) {
        setError(
          departureDate && departureDate > new Date().toISOString().slice(0, 10)
            ? 'No results for future dates on the free plan — enter details manually or upgrade to Aviationstack Basic+.'
            : 'No flights found on this route for the selected date.',
        );
      }
    } catch {
      setError('Could not search flights. Try again later.');
    } finally {
      setSearchLoading(false);
    }
  }

  function selectFlight(f: FlightResult) {
    onAutoFill({
      from_location:   f.from_location,
      to_location:     f.to_location,
      departure_time:  f.departure_time,
      arrival_time:    f.arrival_time,
      reference_number: f.flightNumber,
      airline:         f.airline,
    });
    setResults([]);
    setSearched(false);
    setError(null);
  }

  return (
    <div className="space-y-2">
      {/* Flight number lookup */}
      {canLookup && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLookup}
            disabled={lookupLoading}
            className="flex items-center gap-1.5 text-xs text-navy hover:underline disabled:opacity-50"
          >
            {lookupLoading
              ? <Loader2 size={12} className="animate-spin" />
              : <Search size={12} />}
            Look up {flightNumber.trim().toUpperCase()}
          </button>
          <span className="text-xs text-ink-faint">— auto-fill times from live data</span>
        </div>
      )}

      {/* Route search */}
      {canSearch && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRouteSearch}
            disabled={searchLoading}
            className="flex items-center gap-1.5 text-xs text-navy hover:underline disabled:opacity-50"
          >
            {searchLoading
              ? <Loader2 size={12} className="animate-spin" />
              : <Plane size={12} />}
            Find flights {fromIata} → {toIata}{departureDate ? ` on ${departureDate}` : ''}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="rounded-xl border border-parchment-dark overflow-hidden">
          <div className="px-3 py-1.5 bg-parchment/60 text-xs font-semibold text-ink-faint uppercase tracking-wider">
            {results.length} flight{results.length !== 1 ? 's' : ''} found — click to auto-fill
          </div>
          {results.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectFlight(f)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-parchment/60 transition-colors border-t border-parchment-dark first:border-t-0 text-left"
            >
              <span className="font-mono text-sm font-semibold text-navy w-16 flex-shrink-0">
                {f.flightNumber}
              </span>
              <span className="flex-1 text-sm text-ink truncate">{f.airline}</span>
              <span className="text-xs text-ink-faint flex-shrink-0 tabular-nums">
                {fmtTime(f.departure_time)} → {fmtTime(f.arrival_time)}
              </span>
              {f.status && (
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-parchment border border-parchment-dark text-ink-faint capitalize flex-shrink-0">
                  {f.status}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {searched && !searchLoading && results.length === 0 && !error && (
        <p className="text-xs text-ink-faint">No flights returned.</p>
      )}
    </div>
  );
}
