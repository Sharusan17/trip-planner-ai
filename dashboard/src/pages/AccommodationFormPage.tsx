import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { accommodationApi } from '@/api/accommodation';
import { travellersApi } from '@/api/travellers';
import type { CreateAccommodationInput, CreateRoomInput } from '@trip-planner-ai/shared';
import { ArrowLeft, Plus, Trash2, BedDouble } from 'lucide-react';
import PlaceAutocomplete from '@/components/setup/PlaceAutocomplete';

interface RoomDraft {
  key: string; // local unique key for React
  name: string;
  price: string;
  currency: string;
  traveller_ids: string[];
}

interface FormData {
  name: string;
  address: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  reference_number: string;
  price: string;
  currency: string;
  notes: string;
  traveller_ids: string[];
  rooms: RoomDraft[];
}

let _roomKey = 0;
function newRoomKey() { return String(++_roomKey); }

const emptyForm: FormData = {
  name: '', address: '', check_in_date: '', check_out_date: '',
  check_in_time: '', check_out_time: '',
  reference_number: '', price: '', currency: 'EUR', notes: '',
  traveller_ids: [], rooms: [],
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
      check_in_time: b.check_in_time ?? '',
      check_out_time: b.check_out_time ?? '',
      reference_number: b.reference_number ?? '',
      price: b.price ? String(b.price) : '',
      currency: b.currency ?? 'EUR',
      notes: b.notes ?? '',
      traveller_ids: b.traveller_ids,
      rooms: (b.rooms ?? []).map((r) => ({
        key: newRoomKey(),
        name: r.name,
        price: r.price ? String(r.price) : '',
        currency: r.currency ?? b.currency ?? 'EUR',
        traveller_ids: r.traveller_ids,
      })),
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
    const rooms: CreateRoomInput[] = form.rooms.map((r) => ({
      name: r.name,
      price: r.price ? parseFloat(r.price) : undefined,
      currency: r.currency || form.currency || undefined,
      traveller_ids: r.traveller_ids,
    }));

    const data: CreateAccommodationInput = {
      name: form.name,
      address: form.address || undefined,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      check_in_time: form.check_in_time || undefined,
      check_out_time: form.check_out_time || undefined,
      reference_number: form.reference_number || undefined,
      price: form.price ? parseFloat(form.price) : undefined,
      currency: form.currency || undefined,
      notes: form.notes || undefined,
      traveller_ids: form.traveller_ids,
      rooms,
    };
    if (isEdit && id) updateMutation.mutate({ id, data });
    else createMutation.mutate(data);
  }

  function addRoom() {
    setForm((f) => ({
      ...f,
      rooms: [...f.rooms, { key: newRoomKey(), name: '', price: '', currency: f.currency, traveller_ids: [] }],
    }));
  }

  function updateRoom(key: string, patch: Partial<RoomDraft>) {
    setForm((f) => ({ ...f, rooms: f.rooms.map((r) => r.key === key ? { ...r, ...patch } : r) }));
  }

  function removeRoom(key: string) {
    setForm((f) => ({ ...f, rooms: f.rooms.filter((r) => r.key !== key) }));
  }

  function toggleRoomTraveller(roomKey: string, tid: string) {
    setForm((f) => ({
      ...f,
      rooms: f.rooms.map((r) => {
        if (r.key !== roomKey) return r;
        const has = r.traveller_ids.includes(tid);
        return { ...r, traveller_ids: has ? r.traveller_ids.filter((x) => x !== tid) : [...r.traveller_ids, tid] };
      }),
    }));
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

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Main details card */}
        <div className="vintage-card p-6 space-y-5">
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

          {/* Check-in / Check-out dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Check-in Date *</label>
              <input type="date" className="vintage-input w-full" required value={form.check_in_date}
                onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Check-out Date *</label>
              <input type="date" className="vintage-input w-full" required value={form.check_out_date}
                onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} />
            </div>
          </div>

          {/* Check-in / Check-out times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Check-in Time</label>
              <input type="time" className="vintage-input w-full" value={form.check_in_time}
                onChange={(e) => setForm({ ...form, check_in_time: e.target.value })}
                placeholder="e.g. 15:00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Check-out Time</label>
              <input type="time" className="vintage-input w-full" value={form.check_out_time}
                onChange={(e) => setForm({ ...form, check_out_time: e.target.value })}
                placeholder="e.g. 11:00" />
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Booking Reference</label>
            <input className="vintage-input w-full font-mono" value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
              placeholder="e.g. BKG-45921" />
          </div>

          {/* Price + Currency (total booking price) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Total Price</label>
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

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Notes</label>
            <textarea className="vintage-input w-full" rows={2} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Late check-in, breakfast included…" />
          </div>

          {/* Overall travellers (who is staying) */}
          {travellers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">All Travellers Staying</label>
              <div className="flex flex-wrap gap-2">
                {travellers.map((t) => {
                  const selected = form.traveller_ids.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        traveller_ids: selected
                          ? f.traveller_ids.filter((x) => x !== t.id)
                          : [...f.traveller_ids, t.id],
                      }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                        selected ? 'border-navy bg-navy/10 text-navy' : 'border-parchment-dark bg-white text-ink-faint'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0"
                        style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rooms card */}
        <div className="vintage-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BedDouble size={16} className="text-ink-faint" />
              <h3 className="font-display text-sm font-semibold text-ink">Rooms</h3>
              <span className="text-xs text-ink-faint font-body">(optional)</span>
            </div>
            <button
              type="button"
              onClick={addRoom}
              className="flex items-center gap-1 text-xs text-navy hover:underline font-body"
            >
              <Plus size={13} />
              Add Room
            </button>
          </div>

          {form.rooms.length === 0 && (
            <p className="text-xs text-ink-faint text-center py-3">
              Split the stay into rooms — assign people and a price to each.
            </p>
          )}

          <div className="space-y-4">
            {form.rooms.map((room, idx) => (
              <div key={room.key} className="border border-parchment-dark rounded-xl p-4 space-y-3 bg-parchment/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Room {idx + 1}</span>
                  <button type="button" onClick={() => removeRoom(room.key)}
                    className="text-ink-faint hover:text-terracotta transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Room name */}
                <input
                  className="vintage-input w-full text-sm"
                  placeholder="e.g. Double Room, Family Suite…"
                  value={room.name}
                  onChange={(e) => updateRoom(room.key, { name: e.target.value })}
                  required
                />

                {/* Price per room */}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number" step="0.01" min="0"
                    className="vintage-input w-full text-sm"
                    placeholder="Price"
                    value={room.price}
                    onChange={(e) => updateRoom(room.key, { price: e.target.value })}
                  />
                  <input
                    className="vintage-input w-full uppercase text-sm"
                    placeholder={form.currency || 'EUR'}
                    maxLength={3}
                    value={room.currency}
                    onChange={(e) => updateRoom(room.key, { currency: e.target.value.toUpperCase() })}
                  />
                </div>

                {/* Room travellers */}
                {travellers.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-2">Who's in this room?</p>
                    <div className="flex flex-wrap gap-2">
                      {travellers.map((t) => {
                        const sel = room.traveller_ids.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleRoomTraveller(room.key, t.id)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold transition-all border ${
                              sel ? 'border-navy bg-navy/10 text-navy' : 'border-parchment-dark bg-white text-ink-faint'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0"
                              style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/logistics')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Stay'}
          </button>
        </div>
      </form>
    </div>
  );
}
