import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, ChevronDown } from 'lucide-react';
import { transportApi } from '@/api/transport';
import { travellersApi } from '@/api/travellers';
import type { CreateTransportInput, TransportType } from '@trip-planner-ai/shared';
import { TRANSPORT_ICONS } from '@trip-planner-ai/shared';
import SetupTip from './SetupTip';

const TIPS: Record<string, string> = {
  beach:     "Don't forget your return flight — and any airport transfers to/from the resort!",
  city:      'Add the airport express or taxi booking as a separate entry.',
  ski:       'Add the transfer coach/shuttle from airport to resort here.',
  road_trip: 'Add ferry crossings, toll-road sections, or overnight stops as separate entries.',
  family:    "Add child seat bookings as a note in the entry — handy when collecting the car.",
  cruise:    'Your cruise is also transport — add departure and return port dates here.',
};

interface Draft {
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
  reference_number: string;
  price: string;
  currency: string;
  showArrival: boolean;
}

interface Props {
  tripId: string;
  homeCurrency: string;
  holidayType: string;
}

const TYPE_OPTIONS: TransportType[] = ['flight', 'train', 'bus', 'car', 'ferry', 'other'];

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

  const blankDraft = (): Draft => ({
    transport_type: 'flight',
    from_location: '',
    to_location: '',
    departure_time: '',
    arrival_time: '',
    reference_number: '',
    price: '',
    currency: homeCurrency,
    showArrival: false,
  });

  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [rowError, setRowError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateTransportInput) => transportApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport', tripId] });
      setDraft(blankDraft());
      setRowError(null);
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add booking'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transportApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport', tripId] }),
  });

  const saveDraft = () => {
    if (!draft.from_location.trim() || !draft.to_location.trim() || !draft.departure_time) return;
    const priceNum = parseFloat(draft.price);
    createMutation.mutate({
      transport_type: draft.transport_type,
      from_location: draft.from_location.trim(),
      to_location: draft.to_location.trim(),
      departure_time: draft.departure_time,
      arrival_time: draft.arrival_time || undefined,
      reference_number: draft.reference_number.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      currency: draft.price ? draft.currency : undefined,
      traveller_ids: travellers.map((t) => t.id),
    });
  };

  const fmtDT = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="space-y-3">
      <SetupTip tip={TIPS[holidayType]} />

      {/* Existing bookings */}
      {bookings.length > 0 && (
        <div className="space-y-2">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white"
            >
              <span className="text-xl flex-shrink-0">{TRANSPORT_ICONS[b.transport_type]}</span>
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
                onClick={() => {
                  if (confirm(`Remove ${b.from_location} → ${b.to_location}?`)) deleteMutation.mutate(b.id);
                }}
                className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
                aria-label="Remove booking"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Draft row */}
      <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-2">
        {/* Type + From + To on one line */}
        <div className="flex gap-2">
          <select
            className="vintage-input w-28 text-sm flex-shrink-0"
            value={draft.transport_type}
            onChange={(e) => setDraft({ ...draft, transport_type: e.target.value as TransportType })}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TRANSPORT_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <input
            className="vintage-input flex-1 min-w-0"
            placeholder="From (e.g. LHR)"
            value={draft.from_location}
            onChange={(e) => setDraft({ ...draft, from_location: e.target.value })}
          />
          <input
            className="vintage-input flex-1 min-w-0"
            placeholder="To (e.g. FAO)"
            value={draft.to_location}
            onChange={(e) => setDraft({ ...draft, to_location: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Departure date &amp; time</label>
          <input
            type="datetime-local"
            className="vintage-input w-full"
            value={draft.departure_time}
            onChange={(e) => setDraft({ ...draft, departure_time: e.target.value })}
          />
        </div>

        {/* Arrival time toggle */}
        {draft.showArrival ? (
          <div>
            <label className="block text-xs text-ink-faint mb-1">Arrival date &amp; time (optional)</label>
            <input
              type="datetime-local"
              className="vintage-input w-full"
              value={draft.arrival_time}
              onChange={(e) => setDraft({ ...draft, arrival_time: e.target.value })}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, showArrival: true })}
            className="text-xs text-navy hover:underline flex items-center gap-1"
          >
            <ChevronDown size={12} /> Add arrival time
          </button>
        )}

        <input
          className="vintage-input w-full"
          placeholder="Booking ref / PNR (optional)"
          value={draft.reference_number}
          onChange={(e) => setDraft({ ...draft, reference_number: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Price"
            className="vintage-input col-span-2"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          />
          <select
            className="vintage-input"
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <button
          type="button"
          onClick={saveDraft}
          disabled={
            !draft.from_location.trim() || !draft.to_location.trim() || !draft.departure_time || createMutation.isPending
          }
          className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2.5} /> Add booking
        </button>
      </div>

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}
      <p className="text-xs text-ink-faint">
        {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'} added
      </p>
    </div>
  );
}
