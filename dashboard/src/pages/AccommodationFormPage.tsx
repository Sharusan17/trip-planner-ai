import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { accommodationApi } from '@/api/accommodation';
import { travellersApi } from '@/api/travellers';
import type { CreateAccommodationInput } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';
import PlaceAutocomplete from '@/components/setup/PlaceAutocomplete';

interface FormData {
  name: string; address: string; check_in_date: string; check_out_date: string;
  reference_number: string; price: string; currency: string; notes: string;
  traveller_ids: string[];
}

const emptyForm: FormData = {
  name: '', address: '', check_in_date: '', check_out_date: '',
  reference_number: '', price: '', currency: 'EUR', notes: '', traveller_ids: [],
};

export default function AccommodationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: bookings = [] } = useQuery({
    queryKey: ['accommodation', currentTrip?.id],
    queryFn: () => accommodationApi.list(currentTrip!.id),
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
      name: b.name,
      address: b.address ?? '',
      check_in_date: b.check_in_date,
      check_out_date: b.check_out_date,
      reference_number: b.reference_number ?? '',
      price: b.price ? String(b.price) : '',
      currency: b.currency ?? 'EUR',
      notes: b.notes ?? '',
      traveller_ids: b.traveller_ids,
    });
  }, [isEdit, id, bookings]);

  const createMutation = useMutation({
    mutationFn: (data: CreateAccommodationInput) => accommodationApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accommodation'] }); navigate('/logistics'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: bid, data }: { id: string; data: Partial<CreateAccommodationInput> }) =>
      accommodationApi.update(bid, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accommodation'] }); navigate('/logistics'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateAccommodationInput = {
      name: form.name,
      address: form.address || undefined,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
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
          {isEdit ? 'Edit Stay' : 'Add Stay'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Property Name *</label>
          <PlaceAutocomplete
            searchType="hotel"
            placeholder="e.g. Hotel Bairro Alto"
            value={form.name}
            onChange={(val) => setForm((f) => ({ ...f, name: val }))}
            onSelect={(s) => setForm((f) => ({ ...f, name: s.name, address: s.address ?? f.address }))}
          />
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Address</label>
          <input className="vintage-input w-full" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Auto-filled from search, or type manually" />
        </div>

        {/* Check-in / Check-out */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Check-in *</label>
            <input type="date" className="vintage-input w-full" required value={form.check_in_date}
              onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Check-out *</label>
            <input type="date" className="vintage-input w-full" required value={form.check_out_date}
              onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} />
          </div>
        </div>

        {/* Reference */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Booking Reference</label>
          <input className="vintage-input w-full font-mono" value={form.reference_number}
            onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            placeholder="e.g. BKG-45921" />
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
            <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Travellers Staying</label>
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
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="e.g. Late check-in, breakfast included…" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/logistics')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Stay'}
          </button>
        </div>
      </form>
    </div>
  );
}
