import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { transportApi } from '@/api/transport';
import { travellersApi } from '@/api/travellers';
import type { TransportType, CreateTransportInput } from '@trip-planner-ai/shared';
import { TRANSPORT_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';
import PlaceAutocomplete from '@/components/setup/PlaceAutocomplete';

const TRANSPORT_TYPES: TransportType[] = ['flight', 'train', 'bus', 'car', 'ferry', 'other'];

interface FormData {
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
  reference_number: string;
  price: string;
  currency: string;
  notes: string;
  traveller_ids: string[];
}

const emptyForm: FormData = {
  transport_type: 'flight', from_location: '', to_location: '',
  departure_time: '', arrival_time: '', reference_number: '',
  price: '', currency: 'EUR', notes: '', traveller_ids: [],
};

export default function TransportBookingFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: bookings = [] } = useQuery({
    queryKey: ['transport', currentTrip?.id],
    queryFn: () => transportApi.list(currentTrip!.id),
    enabled: !!currentTrip && isEdit,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  useEffect(() => {
    if (!isEdit || !id || bookings.length === 0) return;
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    setForm({
      transport_type: b.transport_type,
      from_location: b.from_location,
      to_location: b.to_location,
      departure_time: b.departure_time.slice(0, 16),
      arrival_time: b.arrival_time ? b.arrival_time.slice(0, 16) : '',
      reference_number: b.reference_number ?? '',
      price: b.price ? String(b.price) : '',
      currency: b.currency ?? 'EUR',
      notes: b.notes ?? '',
      traveller_ids: b.traveller_ids,
    });
  }, [isEdit, id, bookings]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTransportInput) => transportApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport'] }); navigate('/logistics'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: bid, data }: { id: string; data: Partial<CreateTransportInput> }) =>
      transportApi.update(bid, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport'] }); navigate('/logistics'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateTransportInput = {
      transport_type: form.transport_type,
      from_location: form.from_location,
      to_location: form.to_location,
      departure_time: form.departure_time,
      arrival_time: form.arrival_time || undefined,
      reference_number: form.reference_number || undefined,
      price: form.price ? parseFloat(form.price) : undefined,
      currency: form.currency || undefined,
      notes: form.notes || undefined,
      traveller_ids: form.traveller_ids,
    };
    if (isEdit && id) updateMutation.mutate({ id, data });
    else createMutation.mutate(data);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/logistics')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEdit ? 'Edit Booking' : 'Add Booking'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        {/* Transport type */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {TRANSPORT_TYPES.map((type) => (
              <button key={type} type="button" onClick={() => setForm({ ...form, transport_type: type })}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  form.transport_type === type
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white border-parchment-dark text-ink hover:bg-parchment/60'
                }`}>
                <span>{TRANSPORT_ICONS[type]}</span>
                <span className="capitalize">{type}</span>
              </button>
            ))}
          </div>
        </div>

        {/* From / To */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">From *</label>
            <PlaceAutocomplete
              searchType={form.transport_type === 'flight' ? 'airport' : 'location'}
              placeholder={form.transport_type === 'flight' ? 'e.g. LHR, London' : 'e.g. Lisbon'}
              value={form.from_location}
              onChange={(val) => setForm({ ...form, from_location: val })}
              onSelect={(s) => setForm((f) => ({ ...f, from_location: s.name }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">To *</label>
            <PlaceAutocomplete
              searchType={form.transport_type === 'flight' ? 'airport' : 'location'}
              placeholder={form.transport_type === 'flight' ? 'e.g. FAO, Faro' : 'e.g. London'}
              value={form.to_location}
              onChange={(val) => setForm({ ...form, to_location: val })}
              onSelect={(s) => setForm((f) => ({ ...f, to_location: s.name }))}
            />
          </div>
        </div>

        {/* Departure / Arrival */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Departure *</label>
            <input type="datetime-local" className="vintage-input w-full" required value={form.departure_time}
              onChange={(e) => setForm({ ...form, departure_time: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Arrival</label>
            <input type="datetime-local" className="vintage-input w-full" value={form.arrival_time}
              onChange={(e) => setForm({ ...form, arrival_time: e.target.value })} />
          </div>
        </div>

        {/* Reference */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Reference / Booking No.</label>
          <input className="vintage-input w-full font-mono" value={form.reference_number}
            onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            placeholder="e.g. TP1234" />
        </div>

        {/* Price + Currency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Price</label>
            <input type="number" step="0.01" min="0" className="vintage-input w-full" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Currency</label>
            <input className="vintage-input w-full uppercase" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              placeholder="EUR" maxLength={3} />
          </div>
        </div>

        {/* Travellers */}
        {travellers.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Travellers</label>
            <div className="space-y-1.5">
              {travellers.map((t) => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-navy"
                    checked={form.traveller_ids.includes(t.id)}
                    onChange={() => setForm((f) => ({
                      ...f,
                      traveller_ids: f.traveller_ids.includes(t.id)
                        ? f.traveller_ids.filter((x) => x !== t.id)
                        : [...f.traveller_ids, t.id],
                    }))} />
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                  <span className="text-sm text-ink flex-1">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Notes</label>
          <textarea className="vintage-input w-full" rows={2} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/logistics')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
