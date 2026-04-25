import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, ChevronDown, ArrowLeft, Plane, RotateCcw } from 'lucide-react';
import { transportApi } from '@/api/transport';
import { travellersApi } from '@/api/travellers';
import type { CreateTransportInput, TransportType } from '@trip-planner-ai/shared';
import { TRANSPORT_ICONS } from '@trip-planner-ai/shared';
import SetupTip from './SetupTip';
import PlaceAutocomplete from './PlaceAutocomplete';
import FlightLookup, { type FlightAutoFill } from '@/components/transport/FlightLookup';

const TIPS: Record<string, string> = {
  family:      "Add child seat bookings as a note on the car hire entry — handy when collecting the car.",
  couple:      "Don't forget the return flight — easy to overlook when you're busy planning the outbound trip.",
  friends:     'Book group transfers early — taxis for a large group add up fast.',
  celebration: 'Add any minibus or coach bookings so everyone has the pickup time and details.',
  business:    'Add your booking reference — makes expense claims much easier.',
  solo:        "Add your return journey too — solo travellers sometimes forget the way back!",
};

interface LegDraft {
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
  reference_number: string;
  price: string;
  currency: string;
  showArrival: boolean;
  airline: string;
  departure_terminal: string;
  arrival_terminal: string;
  aircraft_type: string;
}

interface Props {
  tripId: string;
  homeCurrency: string;
  holidayType: string;
}

const TYPE_OPTIONS: TransportType[] = ['flight', 'train', 'bus', 'car', 'ferry', 'other'];
const HAS_RETURN: TransportType[] = ['flight', 'train', 'bus', 'ferry', 'other'];

function blankLeg(currency: string): LegDraft {
  return {
    from_location: '', to_location: '', departure_time: '', arrival_time: '',
    reference_number: '', price: '', currency,
    showArrival: false, airline: '', departure_terminal: '', arrival_terminal: '', aircraft_type: '',
  };
}

export default function SetupStepTransport({ tripId, homeCurrency, holidayType }: Props) {
  const qc = useQueryClient();
  const { data: bookings = [] } = useQuery({
    queryKey: ['transport', tripId],
    queryFn: () => transportApi.list(tripId),
  });
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId),
  });

  const [transportType, setTransportType] = useState<TransportType>('flight');
  const [outbound, setOutbound] = useState<LegDraft>(blankLeg(homeCurrency));
  const [hasReturn, setHasReturn] = useState(false);
  const [returnLeg, setReturnLeg] = useState<LegDraft>(blankLeg(homeCurrency));
  const [rowError, setRowError] = useState<string | null>(null);
  // Flights: start in search mode
  const [showDetails, setShowDetails] = useState(false);

  const resetForm = () => {
    setOutbound(blankLeg(homeCurrency));
    setReturnLeg(blankLeg(homeCurrency));
    setHasReturn(false);
    setShowDetails(false);
    setRowError(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateTransportInput) => transportApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport', tripId] });
      resetForm();
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add booking'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transportApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport', tripId] }),
  });

  const saveDraft = () => {
    if (!outbound.from_location.trim() || !outbound.to_location.trim() || !outbound.departure_time) return;
    const priceNum = parseFloat(outbound.price);

    const payload: CreateTransportInput = {
      transport_type: transportType,
      from_location: outbound.from_location.trim(),
      to_location: outbound.to_location.trim(),
      departure_time: outbound.departure_time,
      arrival_time: outbound.arrival_time || undefined,
      reference_number: outbound.reference_number.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      currency: outbound.price ? outbound.currency : undefined,
      airline: outbound.airline.trim() || undefined,
      departure_terminal: outbound.departure_terminal.trim() || undefined,
      arrival_terminal: outbound.arrival_terminal.trim() || undefined,
      aircraft_type: outbound.aircraft_type.trim() || undefined,
      traveller_ids: travellers.map((t) => t.id),
    };

    // Attach return leg if filled in
    if (hasReturn && returnLeg.from_location.trim() && returnLeg.to_location.trim() && returnLeg.departure_time) {
      const rPrice = parseFloat(returnLeg.price);
      payload.linked_journey = {
        from_location: returnLeg.from_location.trim(),
        to_location: returnLeg.to_location.trim(),
        departure_time: returnLeg.departure_time,
        arrival_time: returnLeg.arrival_time || undefined,
        reference_number: returnLeg.reference_number.trim() || undefined,
        price: isNaN(rPrice) ? undefined : rPrice,
        currency: returnLeg.price ? returnLeg.currency : undefined,
      };
    }

    createMutation.mutate(payload);
  };

  const canSave = outbound.from_location.trim() && outbound.to_location.trim() && outbound.departure_time &&
    (!hasReturn || (returnLeg.from_location.trim() && returnLeg.to_location.trim() && returnLeg.departure_time));

  const fmtDT = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const isFlightSearch = transportType === 'flight' && !showDetails;

  return (
    <div className="space-y-3">
      <SetupTip tip={TIPS[holidayType]} />

      {/* Existing bookings */}
      {bookings.length > 0 && (
        <div className="space-y-2">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white">
              <span className="text-xl flex-shrink-0">{TRANSPORT_ICONS[b.transport_type]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">
                  {b.from_location} &rarr; {b.to_location}
                  {b.linked_booking_id && (
                    <span className="ml-1.5 text-[10px] font-body font-normal text-navy bg-navy/10 border border-navy/20 rounded-full px-1.5 py-0.5">
                      + return
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-faint">
                  {fmtDT(b.departure_time)}
                  {b.arrival_time && ` → ${fmtDT(b.arrival_time)}`}
                  {b.reference_number && ` · ${b.reference_number}`}
                  {b.price != null && ` · ${b.currency ?? ''} ${b.price.toFixed(2)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (confirm(`Remove ${b.from_location} → ${b.to_location}?`)) deleteMutation.mutate(b.id); }}
                className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Draft form */}
      <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-2">
        {/* Transport type */}
        <select
          className="vintage-input text-sm w-full"
          value={transportType}
          onChange={(e) => {
            const t = e.target.value as TransportType;
            setTransportType(t);
            setShowDetails(t !== 'flight');
            setHasReturn(false);
          }}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TRANSPORT_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        {/* ── Outbound leg ── */}
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider pt-1">
          {HAS_RETURN.includes(transportType) ? 'Outbound' : 'Journey'}
        </p>

        {isFlightSearch ? (
          <>
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-faint uppercase tracking-wider">
              <Plane size={12} strokeWidth={2} /> Look up your flight
            </div>
            <input
              className="vintage-input w-full font-mono"
              placeholder="Flight number (e.g. BA456)"
              value={outbound.reference_number}
              onChange={(e) => setOutbound({ ...outbound, reference_number: e.target.value })}
            />
            <div>
              <label className="block text-xs text-ink-faint mb-1">Departure date</label>
              <input
                type="datetime-local"
                className="vintage-input w-full"
                value={outbound.departure_time}
                onChange={(e) => setOutbound({ ...outbound, departure_time: e.target.value })}
              />
            </div>
            <FlightLookup
              flightNumber={outbound.reference_number}
              bookingDate={outbound.departure_time.slice(0, 10)}
              onAutoFill={(data: FlightAutoFill) => {
                const datePart = outbound.departure_time.slice(0, 10);
                const depDT = datePart && data.departure_time_hhmm ? `${datePart}T${data.departure_time_hhmm}` : outbound.departure_time;
                const arrDT = datePart && data.arrival_time_hhmm ? `${datePart}T${data.arrival_time_hhmm}` : outbound.arrival_time;
                setOutbound({
                  ...outbound,
                  from_location: data.from_location,
                  to_location: data.to_location,
                  airline: data.airline,
                  departure_terminal: data.departure_terminal ?? '',
                  arrival_terminal: data.arrival_terminal ?? '',
                  aircraft_type: data.aircraft_type ?? '',
                  departure_time: depDT,
                  arrival_time: arrDT,
                  showArrival: !!arrDT,
                });
                // Pre-fill return leg with swapped airports
                setReturnLeg((r) => ({
                  ...r,
                  from_location: data.to_location,
                  to_location: data.from_location,
                }));
                setShowDetails(true);
              }}
              onManualEntry={() => setShowDetails(true)}
            />
          </>
        ) : (
          <>
            {transportType === 'flight' && (
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="text-xs text-navy hover:underline inline-flex items-center gap-1 pt-0.5"
              >
                <ArrowLeft size={12} strokeWidth={2.5} /> Search for a different flight
              </button>
            )}
            <div className="flex gap-2">
              <PlaceAutocomplete
                searchType={transportType === 'flight' ? 'airport' : 'location'}
                placeholder={transportType === 'flight' ? 'From airport' : 'From'}
                value={outbound.from_location}
                onChange={(val) => setOutbound({ ...outbound, from_location: val })}
                onSelect={(s) => {
                  setOutbound((d) => ({ ...d, from_location: s.name }));
                  setReturnLeg((r) => ({ ...r, to_location: s.name }));
                }}
                className="flex-1 min-w-0"
              />
              <PlaceAutocomplete
                searchType={transportType === 'flight' ? 'airport' : 'location'}
                placeholder={transportType === 'flight' ? 'To airport' : 'To'}
                value={outbound.to_location}
                onChange={(val) => setOutbound({ ...outbound, to_location: val })}
                onSelect={(s) => {
                  setOutbound((d) => ({ ...d, to_location: s.name }));
                  setReturnLeg((r) => ({ ...r, from_location: s.name }));
                }}
                className="flex-1 min-w-0"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-faint mb-1">Departure date &amp; time</label>
              <input
                type="datetime-local"
                className="vintage-input w-full"
                value={outbound.departure_time}
                onChange={(e) => setOutbound({ ...outbound, departure_time: e.target.value })}
              />
            </div>
            {outbound.showArrival ? (
              <div>
                <label className="block text-xs text-ink-faint mb-1">Arrival date &amp; time (optional)</label>
                <input
                  type="datetime-local"
                  className="vintage-input w-full"
                  value={outbound.arrival_time}
                  onChange={(e) => setOutbound({ ...outbound, arrival_time: e.target.value })}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOutbound({ ...outbound, showArrival: true })}
                className="text-xs text-navy hover:underline flex items-center gap-1"
              >
                <ChevronDown size={12} /> Add arrival time
              </button>
            )}
            <input
              className="vintage-input w-full font-mono"
              placeholder={transportType === 'flight' ? 'Flight number (e.g. BA456)' : 'Booking reference (optional)'}
              value={outbound.reference_number}
              onChange={(e) => setOutbound({ ...outbound, reference_number: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number" step="0.01" min="0"
                placeholder="Price"
                className="vintage-input col-span-2"
                value={outbound.price}
                onChange={(e) => setOutbound({ ...outbound, price: e.target.value })}
              />
              <select className="vintage-input" value={outbound.currency}
                onChange={(e) => setOutbound({ ...outbound, currency: e.target.value })}>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </>
        )}

        {/* ── Return leg toggle (non-car, non-search-stage) ── */}
        {HAS_RETURN.includes(transportType) && !isFlightSearch && (
          <div className="pt-1 border-t border-parchment-dark mt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-navy"
                checked={hasReturn}
                onChange={(e) => {
                  setHasReturn(e.target.checked);
                  if (e.target.checked) {
                    // Pre-swap airports from outbound
                    setReturnLeg((r) => ({
                      ...r,
                      from_location: r.from_location || outbound.to_location,
                      to_location: r.to_location || outbound.from_location,
                      currency: outbound.currency,
                    }));
                  }
                }}
              />
              <span className="text-xs font-semibold text-ink flex items-center gap-1">
                <RotateCcw size={12} className="text-navy" />
                Include return journey
              </span>
            </label>

            {hasReturn && (
              <div className="mt-2 space-y-2 pl-4 border-l-2 border-navy/20">
                <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">Return</p>
                <div className="flex gap-2">
                  <PlaceAutocomplete
                    searchType={transportType === 'flight' ? 'airport' : 'location'}
                    placeholder={transportType === 'flight' ? 'From airport' : 'From'}
                    value={returnLeg.from_location}
                    onChange={(val) => setReturnLeg({ ...returnLeg, from_location: val })}
                    onSelect={(s) => setReturnLeg((r) => ({ ...r, from_location: s.name }))}
                    className="flex-1 min-w-0"
                  />
                  <PlaceAutocomplete
                    searchType={transportType === 'flight' ? 'airport' : 'location'}
                    placeholder={transportType === 'flight' ? 'To airport' : 'To'}
                    value={returnLeg.to_location}
                    onChange={(val) => setReturnLeg({ ...returnLeg, to_location: val })}
                    onSelect={(s) => setReturnLeg((r) => ({ ...r, to_location: s.name }))}
                    className="flex-1 min-w-0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Return departure</label>
                  <input
                    type="datetime-local"
                    className="vintage-input w-full"
                    value={returnLeg.departure_time}
                    onChange={(e) => setReturnLeg({ ...returnLeg, departure_time: e.target.value })}
                  />
                </div>
                {returnLeg.showArrival ? (
                  <div>
                    <label className="block text-xs text-ink-faint mb-1">Return arrival (optional)</label>
                    <input
                      type="datetime-local"
                      className="vintage-input w-full"
                      value={returnLeg.arrival_time}
                      onChange={(e) => setReturnLeg({ ...returnLeg, arrival_time: e.target.value })}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReturnLeg({ ...returnLeg, showArrival: true })}
                    className="text-xs text-navy hover:underline flex items-center gap-1"
                  >
                    <ChevronDown size={12} /> Add return arrival time
                  </button>
                )}
                <input
                  className="vintage-input w-full font-mono"
                  placeholder={transportType === 'flight' ? 'Return flight number (optional)' : 'Return booking ref (optional)'}
                  value={returnLeg.reference_number}
                  onChange={(e) => setReturnLeg({ ...returnLeg, reference_number: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number" step="0.01" min="0"
                    placeholder="Return price"
                    className="vintage-input col-span-2"
                    value={returnLeg.price}
                    onChange={(e) => setReturnLeg({ ...returnLeg, price: e.target.value })}
                  />
                  <select className="vintage-input" value={returnLeg.currency}
                    onChange={(e) => setReturnLeg({ ...returnLeg, currency: e.target.value })}>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {!isFlightSearch && (
          <button
            type="button"
            onClick={saveDraft}
            disabled={!canSave || createMutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2.5} />
            {hasReturn ? 'Add outbound + return' : 'Add booking'}
          </button>
        )}
      </div>

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}
      <p className="text-xs text-ink-faint">
        {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'} added
      </p>
    </div>
  );
}
