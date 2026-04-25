import { useMemo, useState } from 'react';
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
// Types that support a return journey (everything except car)
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
  const [returnLeg, setReturnLeg] = useState<LegDraft>(blankLeg(homeCurrency));
  // Non-flight return toggle
  const [hasReturn, setHasReturn] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  // Flights: start in search mode (just flight number + date), switch to full form after lookup
  const [showDetails, setShowDetails] = useState(false);
  // Flight pricing: total (one price for the pair) or per-leg
  const [pricingMode, setPricingMode] = useState<'total' | 'per-leg'>('total');
  const [totalPrice, setTotalPrice] = useState('');
  const [totalCurrency, setTotalCurrency] = useState(homeCurrency);

  const resetForm = () => {
    setOutbound(blankLeg(homeCurrency));
    setReturnLeg(blankLeg(homeCurrency));
    setHasReturn(false);
    setShowDetails(false);
    setRowError(null);
    setPricingMode('total');
    setTotalPrice('');
    setTotalCurrency(homeCurrency);
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

  // All bookings shown; linked pairs get directional emojis (🛫 outbound, 🛬 return).
  const displayBookings = bookings;

  const flightEmoji = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) {
      if (b.transport_type !== 'flight' || !b.linked_booking_id) continue;
      const partner = bookings.find((x) => x.id === b.linked_booking_id);
      if (!partner) continue;
      map.set(b.id, b.departure_time <= partner.departure_time ? '🛫' : '🛬');
    }
    return map;
  }, [bookings]);

  const returnFilled = returnLeg.from_location.trim() && returnLeg.to_location.trim() && returnLeg.departure_time;

  const saveDraft = () => {
    if (!outbound.from_location.trim() || !outbound.to_location.trim() || !outbound.departure_time) return;

    // Determine outbound price based on mode
    const isFlightPair = transportType === 'flight' && showDetails;
    let outPrice: number | undefined;
    let outCurrency: string | undefined;
    if (isFlightPair && pricingMode === 'total') {
      const tp = parseFloat(totalPrice);
      outPrice = isNaN(tp) ? undefined : tp;
      outCurrency = totalPrice ? totalCurrency : undefined;
    } else {
      const p = parseFloat(outbound.price);
      outPrice = isNaN(p) ? undefined : p;
      outCurrency = outbound.price ? outbound.currency : undefined;
    }

    const payload: CreateTransportInput = {
      transport_type: transportType,
      from_location: outbound.from_location.trim(),
      to_location: outbound.to_location.trim(),
      departure_time: outbound.departure_time,
      arrival_time: outbound.arrival_time || undefined,
      reference_number: outbound.reference_number.trim() || undefined,
      price: outPrice,
      currency: outCurrency,
      airline: outbound.airline.trim() || undefined,
      departure_terminal: outbound.departure_terminal.trim() || undefined,
      arrival_terminal: outbound.arrival_terminal.trim() || undefined,
      aircraft_type: outbound.aircraft_type.trim() || undefined,
      traveller_ids: travellers.map((t) => t.id),
    };

    // For flights: include return if filled. For non-flights: include if checkbox + filled.
    const includeReturn = transportType === 'flight' ? !!returnFilled : (hasReturn && !!returnFilled);
    if (includeReturn) {
      // Per-leg mode: return gets its own price. Total mode: return price is null (covered by outbound).
      const rPrice = pricingMode === 'per-leg' ? parseFloat(returnLeg.price) : NaN;
      payload.linked_journey = {
        from_location: returnLeg.from_location.trim(),
        to_location: returnLeg.to_location.trim(),
        departure_time: returnLeg.departure_time,
        arrival_time: returnLeg.arrival_time || undefined,
        reference_number: returnLeg.reference_number.trim() || undefined,
        price: isNaN(rPrice) ? undefined : rPrice,
        currency: pricingMode === 'per-leg' && returnLeg.price ? returnLeg.currency : undefined,
      };
    }

    createMutation.mutate(payload);
  };

  const canSave = !!(
    outbound.from_location.trim() &&
    outbound.to_location.trim() &&
    outbound.departure_time &&
    // Non-flight return checkbox: return must be filled if ticked
    (transportType === 'flight' || !hasReturn || returnFilled)
  );

  const fmtDT = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const isFlightSearch = transportType === 'flight' && !showDetails;

  // Auto-fill helper for outbound
  const applyOutboundAutoFill = (data: FlightAutoFill) => {
    const datePart = outbound.departure_time.slice(0, 10);
    const depDT = datePart && data.departure_time_hhmm ? `${datePart}T${data.departure_time_hhmm}` : outbound.departure_time;
    const arrDT = datePart && data.arrival_time_hhmm ? `${datePart}T${data.arrival_time_hhmm}` : outbound.arrival_time;
    setOutbound((o) => ({
      ...o,
      from_location: data.from_location,
      to_location: data.to_location,
      airline: data.airline,
      departure_terminal: data.departure_terminal ?? '',
      arrival_terminal: data.arrival_terminal ?? '',
      aircraft_type: data.aircraft_type ?? '',
      departure_time: depDT,
      arrival_time: arrDT,
      showArrival: !!arrDT,
    }));
    // Pre-fill return with swapped airports
    setReturnLeg((r) => ({
      ...r,
      from_location: r.from_location || data.to_location,
      to_location: r.to_location || data.from_location,
    }));
    setShowDetails(true);
  };

  // Auto-fill helper for return leg
  const applyReturnAutoFill = (data: FlightAutoFill) => {
    const datePart = returnLeg.departure_time.slice(0, 10);
    const depDT = datePart && data.departure_time_hhmm ? `${datePart}T${data.departure_time_hhmm}` : returnLeg.departure_time;
    const arrDT = datePart && data.arrival_time_hhmm ? `${datePart}T${data.arrival_time_hhmm}` : '';
    setReturnLeg((r) => ({
      ...r,
      from_location: data.from_location,
      to_location: data.to_location,
      departure_time: depDT,
      arrival_time: arrDT,
      showArrival: !!arrDT,
    }));
  };

  return (
    <div className="space-y-3">
      <SetupTip tip={TIPS[holidayType]} />

      {/* Existing bookings (outbound only for linked pairs) */}
      {displayBookings.length > 0 && (
        <div className="space-y-2">
          {displayBookings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white">
              <span className="text-xl flex-shrink-0">
                {flightEmoji.get(b.id) ?? TRANSPORT_ICONS[b.transport_type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">
                  {b.from_location} &rarr; {b.to_location}
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
      <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-3">
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

        {/* ─── FLIGHT: Stage 1 — look up outbound first ─── */}
        {isFlightSearch && (
          <>
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">Outbound</p>
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
              onAutoFill={applyOutboundAutoFill}
              onManualEntry={() => setShowDetails(true)}
            />
          </>
        )}

        {/* ─── FLIGHT: Stage 2 — outbound + return sections ─── */}
        {transportType === 'flight' && showDetails && (
          <>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="text-xs text-navy hover:underline inline-flex items-center gap-1 pt-0.5"
            >
              <ArrowLeft size={12} strokeWidth={2.5} /> Search for a different outbound flight
            </button>

            {/* OUTBOUND section */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">Outbound</p>
              <div className="flex gap-2">
                <PlaceAutocomplete
                  searchType="airport"
                  placeholder="From airport"
                  value={outbound.from_location}
                  onChange={(val) => setOutbound({ ...outbound, from_location: val })}
                  onSelect={(s) => {
                    setOutbound((d) => ({ ...d, from_location: s.name }));
                    setReturnLeg((r) => ({ ...r, to_location: r.to_location || s.name }));
                  }}
                  className="flex-1 min-w-0"
                />
                <PlaceAutocomplete
                  searchType="airport"
                  placeholder="To airport"
                  value={outbound.to_location}
                  onChange={(val) => setOutbound({ ...outbound, to_location: val })}
                  onSelect={(s) => {
                    setOutbound((d) => ({ ...d, to_location: s.name }));
                    setReturnLeg((r) => ({ ...r, from_location: r.from_location || s.name }));
                  }}
                  className="flex-1 min-w-0"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-faint mb-1">Departure date &amp; time</label>
                <input
                  type="datetime-local" className="vintage-input w-full"
                  value={outbound.departure_time}
                  onChange={(e) => setOutbound({ ...outbound, departure_time: e.target.value })}
                />
              </div>
              {outbound.showArrival ? (
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Arrival date &amp; time</label>
                  <input
                    type="datetime-local" className="vintage-input w-full"
                    value={outbound.arrival_time}
                    onChange={(e) => setOutbound({ ...outbound, arrival_time: e.target.value })}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setOutbound({ ...outbound, showArrival: true })}
                  className="text-xs text-navy hover:underline flex items-center gap-1">
                  <ChevronDown size={12} /> Add arrival time
                </button>
              )}
              <input
                className="vintage-input w-full font-mono"
                placeholder="Flight number (e.g. BA456)"
                value={outbound.reference_number}
                onChange={(e) => setOutbound({ ...outbound, reference_number: e.target.value })}
              />
            </div>

            {/* RETURN section — always visible for flights, no checkbox */}
            <div className="pt-2 border-t border-parchment-dark space-y-2">
              <div className="flex items-center gap-1.5">
                <RotateCcw size={12} className="text-navy" />
                <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">
                  Return <span className="normal-case font-normal text-ink-faint">(optional)</span>
                </p>
              </div>

              {/* Return flight lookup */}
              <input
                className="vintage-input w-full font-mono"
                placeholder="Return flight number (e.g. TP1235)"
                value={returnLeg.reference_number}
                onChange={(e) => setReturnLeg({ ...returnLeg, reference_number: e.target.value })}
              />
              <div>
                <label className="block text-xs text-ink-faint mb-1">Return departure date &amp; time</label>
                <input
                  type="datetime-local" className="vintage-input w-full"
                  value={returnLeg.departure_time}
                  onChange={(e) => setReturnLeg({ ...returnLeg, departure_time: e.target.value })}
                />
              </div>
              <FlightLookup
                flightNumber={returnLeg.reference_number}
                bookingDate={returnLeg.departure_time.slice(0, 10)}
                onAutoFill={applyReturnAutoFill}
              />

              {/* Return from/to — pre-filled by lookup, still editable */}
              <div className="flex gap-2">
                <PlaceAutocomplete
                  searchType="airport"
                  placeholder="From airport"
                  value={returnLeg.from_location}
                  onChange={(val) => setReturnLeg({ ...returnLeg, from_location: val })}
                  onSelect={(s) => setReturnLeg((r) => ({ ...r, from_location: s.name }))}
                  className="flex-1 min-w-0"
                />
                <PlaceAutocomplete
                  searchType="airport"
                  placeholder="To airport"
                  value={returnLeg.to_location}
                  onChange={(val) => setReturnLeg({ ...returnLeg, to_location: val })}
                  onSelect={(s) => setReturnLeg((r) => ({ ...r, to_location: s.name }))}
                  className="flex-1 min-w-0"
                />
              </div>
              {returnLeg.showArrival ? (
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Return arrival date &amp; time</label>
                  <input
                    type="datetime-local" className="vintage-input w-full"
                    value={returnLeg.arrival_time}
                    onChange={(e) => setReturnLeg({ ...returnLeg, arrival_time: e.target.value })}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setReturnLeg({ ...returnLeg, showArrival: true })}
                  className="text-xs text-navy hover:underline flex items-center gap-1">
                  <ChevronDown size={12} /> Add return arrival time
                </button>
              )}
            </div>

            {/* ── Unified pricing for flight pair ── */}
            <div className="pt-2 border-t border-parchment-dark space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">Price</p>
                <div className="flex rounded-lg border border-parchment-dark overflow-hidden text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      if (pricingMode === 'per-leg') {
                        const sum = (parseFloat(outbound.price) || 0) + (parseFloat(returnLeg.price) || 0);
                        if (sum > 0) setTotalPrice(sum.toFixed(2));
                      }
                      setPricingMode('total');
                    }}
                    className={`px-3 py-1.5 transition-colors ${pricingMode === 'total' ? 'bg-navy text-white' : 'bg-white text-ink-faint hover:bg-parchment/60'}`}
                  >
                    Total
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pricingMode === 'total') {
                        const half = parseFloat(totalPrice) / 2;
                        if (!isNaN(half) && half > 0) {
                          setOutbound((o) => ({ ...o, price: half.toFixed(2) }));
                          setReturnLeg((r) => ({ ...r, price: half.toFixed(2) }));
                        }
                      }
                      setPricingMode('per-leg');
                    }}
                    className={`px-3 py-1.5 border-l border-parchment-dark transition-colors ${pricingMode === 'per-leg' ? 'bg-navy text-white' : 'bg-white text-ink-faint hover:bg-parchment/60'}`}
                  >
                    Per leg
                  </button>
                </div>
              </div>

              {pricingMode === 'total' ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number" step="0.01" min="0"
                      placeholder="Total for both legs"
                      className="vintage-input col-span-2"
                      value={totalPrice}
                      onChange={(e) => setTotalPrice(e.target.value)}
                    />
                    <select className="vintage-input" value={totalCurrency}
                      onChange={(e) => setTotalCurrency(e.target.value)}>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-ink-faint">Covers both outbound &amp; return. Switch to "Per leg" to split.</p>
                </>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-6 flex-shrink-0">🛫</span>
                    <input
                      type="number" step="0.01" min="0" placeholder="0.00"
                      className="vintage-input flex-1 text-sm"
                      value={outbound.price}
                      onChange={(e) => setOutbound({ ...outbound, price: e.target.value })}
                    />
                    <select className="vintage-input text-sm" style={{ width: 'auto' }}
                      value={outbound.currency}
                      onChange={(e) => setOutbound({ ...outbound, currency: e.target.value })}>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-6 flex-shrink-0">🛬</span>
                    <input
                      type="number" step="0.01" min="0" placeholder="0.00"
                      className="vintage-input flex-1 text-sm"
                      value={returnLeg.price}
                      onChange={(e) => setReturnLeg({ ...returnLeg, price: e.target.value })}
                    />
                    <select className="vintage-input text-sm" style={{ width: 'auto' }}
                      value={returnLeg.currency}
                      onChange={(e) => setReturnLeg({ ...returnLeg, currency: e.target.value })}>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── NON-FLIGHT: single form + optional return checkbox ─── */}
        {transportType !== 'flight' && (
          <>
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">
              {HAS_RETURN.includes(transportType) ? 'Outbound' : 'Journey'}
            </p>
            <div className="flex gap-2">
              <PlaceAutocomplete
                searchType="location"
                placeholder="From"
                value={outbound.from_location}
                onChange={(val) => setOutbound({ ...outbound, from_location: val })}
                onSelect={(s) => {
                  setOutbound((d) => ({ ...d, from_location: s.name }));
                  setReturnLeg((r) => ({ ...r, to_location: r.to_location || s.name }));
                }}
                className="flex-1 min-w-0"
              />
              <PlaceAutocomplete
                searchType="location"
                placeholder="To"
                value={outbound.to_location}
                onChange={(val) => setOutbound({ ...outbound, to_location: val })}
                onSelect={(s) => {
                  setOutbound((d) => ({ ...d, to_location: s.name }));
                  setReturnLeg((r) => ({ ...r, from_location: r.from_location || s.name }));
                }}
                className="flex-1 min-w-0"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-faint mb-1">Departure date &amp; time</label>
              <input
                type="datetime-local" className="vintage-input w-full"
                value={outbound.departure_time}
                onChange={(e) => setOutbound({ ...outbound, departure_time: e.target.value })}
              />
            </div>
            {outbound.showArrival ? (
              <div>
                <label className="block text-xs text-ink-faint mb-1">Arrival date &amp; time (optional)</label>
                <input
                  type="datetime-local" className="vintage-input w-full"
                  value={outbound.arrival_time}
                  onChange={(e) => setOutbound({ ...outbound, arrival_time: e.target.value })}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setOutbound({ ...outbound, showArrival: true })}
                className="text-xs text-navy hover:underline flex items-center gap-1">
                <ChevronDown size={12} /> Add arrival time
              </button>
            )}
            <input
              className="vintage-input w-full font-mono"
              placeholder="Booking reference (optional)"
              value={outbound.reference_number}
              onChange={(e) => setOutbound({ ...outbound, reference_number: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number" step="0.01" min="0" placeholder="Price"
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

            {/* Non-flight return toggle */}
            {HAS_RETURN.includes(transportType) && (
              <div className="pt-1 border-t border-parchment-dark">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-navy"
                    checked={hasReturn}
                    onChange={(e) => {
                      setHasReturn(e.target.checked);
                      if (e.target.checked) {
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
                        searchType="location"
                        placeholder="From"
                        value={returnLeg.from_location}
                        onChange={(val) => setReturnLeg({ ...returnLeg, from_location: val })}
                        onSelect={(s) => setReturnLeg((r) => ({ ...r, from_location: s.name }))}
                        className="flex-1 min-w-0"
                      />
                      <PlaceAutocomplete
                        searchType="location"
                        placeholder="To"
                        value={returnLeg.to_location}
                        onChange={(val) => setReturnLeg({ ...returnLeg, to_location: val })}
                        onSelect={(s) => setReturnLeg((r) => ({ ...r, to_location: s.name }))}
                        className="flex-1 min-w-0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-faint mb-1">Return departure</label>
                      <input
                        type="datetime-local" className="vintage-input w-full"
                        value={returnLeg.departure_time}
                        onChange={(e) => setReturnLeg({ ...returnLeg, departure_time: e.target.value })}
                      />
                    </div>
                    {returnLeg.showArrival ? (
                      <div>
                        <label className="block text-xs text-ink-faint mb-1">Return arrival (optional)</label>
                        <input
                          type="datetime-local" className="vintage-input w-full"
                          value={returnLeg.arrival_time}
                          onChange={(e) => setReturnLeg({ ...returnLeg, arrival_time: e.target.value })}
                        />
                      </div>
                    ) : (
                      <button type="button" onClick={() => setReturnLeg({ ...returnLeg, showArrival: true })}
                        className="text-xs text-navy hover:underline flex items-center gap-1">
                        <ChevronDown size={12} /> Add return arrival time
                      </button>
                    )}
                    <input
                      className="vintage-input w-full font-mono"
                      placeholder="Return booking ref (optional)"
                      value={returnLeg.reference_number}
                      onChange={(e) => setReturnLeg({ ...returnLeg, reference_number: e.target.value })}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number" step="0.01" min="0" placeholder="Return price"
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
          </>
        )}

        {/* Save button — hidden during flight search stage 1 */}
        {!isFlightSearch && (
          <button
            type="button"
            onClick={saveDraft}
            disabled={!canSave || createMutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2.5} />
            {returnFilled ? 'Add outbound + return' : 'Add booking'}
          </button>
        )}
      </div>

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}
      <p className="text-xs text-ink-faint">
        {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'} added
        {bookings.length > 0 && (
          <span className="ml-2 text-navy cursor-pointer hover:underline" onClick={resetForm}>
            + add another
          </span>
        )}
      </p>
    </div>
  );
}
