import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { accommodationApi } from '../api/accommodation';
import { travellersApi } from '../api/travellers';
import type { AccommodationBooking, CreateAccommodationInput } from '@trip-planner-ai/shared';

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function nightCount(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface FormData {
  name: string;
  address: string;
  check_in_date: string;
  check_out_date: string;
  reference_number: string;
  price: string;
  currency: string;
  notes: string;
  traveller_ids: string[];
}

const emptyForm: FormData = {
  name: '', address: '', check_in_date: '', check_out_date: '',
  reference_number: '', price: '', currency: 'EUR', notes: '', traveller_ids: [],
};

export default function AccommodationPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccommodationBooking | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['accommodation', currentTrip?.id],
    queryFn: () => accommodationApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAccommodationInput) => accommodationApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accommodation', currentTrip?.id] }); closeForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAccommodationInput> }) =>
      accommodationApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accommodation', currentTrip?.id] }); closeForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accommodationApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accommodation', currentTrip?.id] }),
  });

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function openEdit(b: AccommodationBooking) {
    setEditing(b);
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
    setShowForm(true);
  }

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
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function toggleTraveller(id: string) {
    setForm((f) => ({
      ...f,
      traveller_ids: f.traveller_ids.includes(id)
        ? f.traveller_ids.filter((t) => t !== id)
        : [...f.traveller_ids, id],
    }));
  }

  // Timeline: visual bar relative to trip dates
  const tripStart = currentTrip ? new Date(currentTrip.start_date).getTime() : 0;
  const tripEnd = currentTrip ? new Date(currentTrip.end_date).getTime() : 1;
  const tripDuration = tripEnd - tripStart || 1;

  const PALETTE = ['#1B3A5C', '#C65D3E', '#B8963E', '#2D6A4F', '#7B4F2E'];

  if (!currentTrip) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-navy">Accommodation</h1>
        {isOrganiser && (
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}>
            + Add Stay
          </button>
        )}
      </div>

      {/* Timeline */}
      {bookings.length > 0 && (
        <div className="vintage-card p-4 mb-6">
          <h2 className="text-sm font-semibold text-ink/60 mb-3">Stay Timeline</h2>
          <div className="relative h-8">
            {bookings.map((b, i) => {
              const start = Math.max(0, (new Date(b.check_in_date).getTime() - tripStart) / tripDuration);
              const end = Math.min(1, (new Date(b.check_out_date).getTime() - tripStart) / tripDuration);
              if (end <= start) return null;
              return (
                <div
                  key={b.id}
                  className="absolute h-6 rounded flex items-center px-2 text-xs text-white font-medium overflow-hidden top-1"
                  style={{
                    left: `${start * 100}%`,
                    width: `${(end - start) * 100}%`,
                    backgroundColor: PALETTE[i % PALETTE.length],
                  }}
                  title={b.name}
                >
                  <span className="truncate">{b.name}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-ink/40 mt-2">
            <span>{formatDate(currentTrip.start_date)}</span>
            <span>{formatDate(currentTrip.end_date)}</span>
          </div>
        </div>
      )}

      {/* Booking list */}
      {isLoading ? (
        <p className="text-ink/50 text-center py-8">Loading accommodation...</p>
      ) : bookings.length === 0 ? (
        <div className="vintage-card text-center py-12">
          <p className="text-3xl mb-2">🏨</p>
          <p className="text-ink/60">No accommodation added yet.</p>
          {isOrganiser && (
            <button className="btn-primary mt-4"
              onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}>
              Add first stay
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const nights = nightCount(b.check_in_date, b.check_out_date);
            const travellerNames = b.traveller_ids
              .map((id) => travellers.find((t) => t.id === id))
              .filter(Boolean);
            return (
              <div key={b.id} className="vintage-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">🏨</span>
                      <h3 className="font-semibold text-ink text-lg">{b.name}</h3>
                    </div>
                    {b.address && (
                      <p className="text-sm text-ink/60 mb-2">{b.address}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/70 mb-2">
                      <span>
                        📅 {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                      </span>
                      <span className="badge badge-navy">{nights} night{nights !== 1 ? 's' : ''}</span>
                    </div>
                    {b.reference_number && (
                      <p className="text-sm text-ink/60">Ref: <span className="font-mono">{b.reference_number}</span></p>
                    )}
                    {b.price && b.currency && (
                      <p className="text-sm font-semibold text-navy mt-1">
                        {formatCurrency(b.price, b.currency)}
                        {b.price_home !== null && b.currency !== currentTrip.home_currency && (
                          <span className="text-sm font-normal text-ink/50 ml-2">
                            (~{formatCurrency(b.price_home, currentTrip.home_currency)})
                          </span>
                        )}
                      </p>
                    )}
                    {travellerNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {travellerNames.map((t) => t && (
                          <span
                            key={t.id}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: t.avatar_colour }}
                            title={t.name}
                          >
                            {t.name.charAt(0).toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                    {b.notes && <p className="text-sm text-ink/50 mt-2 italic">{b.notes}</p>}
                  </div>
                  {isOrganiser && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button onClick={() => openEdit(b)} className="btn-secondary text-xs py-1 px-3">Edit</button>
                      <button
                        onClick={() => { if (confirm('Delete this booking?')) deleteMutation.mutate(b.id); }}
                        className="btn-danger text-xs py-1 px-3"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="vintage-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editing ? 'Edit Stay' : 'Add Stay'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Property Name *</label>
                <input className="vintage-input w-full" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Address</label>
                <textarea className="vintage-input w-full" rows={2} value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Check-in *</label>
                  <input type="date" className="vintage-input w-full" value={form.check_in_date}
                    onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Check-out *</label>
                  <input type="date" className="vintage-input w-full" value={form.check_out_date}
                    onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Booking Reference</label>
                <input className="vintage-input w-full font-mono" value={form.reference_number}
                  onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Price</label>
                  <input type="number" step="0.01" min="0" className="vintage-input w-full"
                    value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Currency</label>
                  <input className="vintage-input w-full uppercase" maxLength={3}
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Guests</label>
                <div className="flex flex-wrap gap-2">
                  {travellers.map((t) => (
                    <label key={t.id} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.traveller_ids.includes(t.id)}
                        onChange={() => toggleTraveller(t.id)}
                        className="accent-navy"
                      />
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: t.avatar_colour }}
                      >
                        {t.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm text-ink">{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea className="vintage-input w-full" rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}>
                  {editing ? 'Save Changes' : 'Add Stay'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
