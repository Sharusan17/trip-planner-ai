import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, BedDouble } from 'lucide-react';
import { accommodationApi } from '@/api/accommodation';
import { travellersApi } from '@/api/travellers';
import type { CreateAccommodationInput, CreateRoomInput } from '@trip-planner-ai/shared';
import SetupTip from './SetupTip';
import PlaceAutocomplete from './PlaceAutocomplete';
import { parseLocalDate } from '@/utils/date';

const TIPS: Record<string, string> = {
  family:      'Two rooms? Add them as separate entries with the same dates so costs split correctly.',
  couple:      'Save the hotel address — handy when navigating there after a long journey.',
  friends:     "Sharing an Airbnb or villa? Add it as one entry and split the total across the group.",
  celebration: 'Add the main venue hotel and any overflow accommodation as separate entries.',
  business:    'Add the conference hotel and any client dinner venue as separate entries.',
  solo:        'Save your hostel or hotel address — handy when you land and need to navigate.',
};

let _roomKey = 0;
function newRoomKey() { return String(++_roomKey); }

interface RoomDraft {
  key: string;
  name: string;
  price: string;
  currency: string;
  traveller_ids: string[];
}

interface Draft {
  name: string;
  address: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  reference_number: string;
  price: string;
  currency: string;
  rooms: RoomDraft[];
}

interface Props {
  tripId: string;
  homeCurrency: string;
  holidayType: string;
}

function blankDraft(currency: string): Draft {
  return {
    name: '', address: '', check_in_date: '', check_out_date: '',
    check_in_time: '', check_out_time: '',
    reference_number: '', price: '', currency,
    rooms: [],
  };
}

export default function SetupStepAccommodation({ tripId, homeCurrency, holidayType }: Props) {
  const qc = useQueryClient();
  const { data: stays = [] } = useQuery({
    queryKey: ['accommodation', tripId],
    queryFn: () => accommodationApi.list(tripId),
  });
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId),
  });

  const [draft, setDraft] = useState<Draft>(blankDraft(homeCurrency));
  const [rowError, setRowError] = useState<string | null>(null);
  const [showRooms, setShowRooms] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: CreateAccommodationInput) => accommodationApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accommodation', tripId] });
      setDraft(blankDraft(homeCurrency));
      setShowRooms(false);
      setRowError(null);
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add stay'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accommodationApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accommodation', tripId] }),
  });

  // Travellers already assigned to some room (for exclusivity)
  const assignedInRooms = (excludeKey: string): Set<string> => {
    const set = new Set<string>();
    for (const r of draft.rooms) {
      if (r.key === excludeKey) continue;
      for (const tid of r.traveller_ids) set.add(tid);
    }
    return set;
  };

  const addRoom = () => {
    setDraft((d) => ({
      ...d,
      rooms: [...d.rooms, { key: newRoomKey(), name: '', price: '', currency: d.currency, traveller_ids: [] }],
    }));
  };

  const updateRoom = (key: string, patch: Partial<RoomDraft>) => {
    setDraft((d) => ({ ...d, rooms: d.rooms.map((r) => r.key === key ? { ...r, ...patch } : r) }));
  };

  const removeRoom = (key: string) => {
    setDraft((d) => ({ ...d, rooms: d.rooms.filter((r) => r.key !== key) }));
  };

  const toggleRoomTraveller = (roomKey: string, tid: string) => {
    setDraft((d) => ({
      ...d,
      rooms: d.rooms.map((r) => {
        if (r.key !== roomKey) return r;
        const has = r.traveller_ids.includes(tid);
        return { ...r, traveller_ids: has ? r.traveller_ids.filter((x) => x !== tid) : [...r.traveller_ids, tid] };
      }),
    }));
  };

  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name || !draft.check_in_date || !draft.check_out_date) return;
    const priceNum = parseFloat(draft.price);

    const rooms: CreateRoomInput[] = draft.rooms.map((r) => ({
      name: r.name || 'Room',
      price: parseFloat(r.price) || undefined,
      currency: r.currency || draft.currency || undefined,
      traveller_ids: r.traveller_ids,
    }));

    createMutation.mutate({
      name,
      address: draft.address.trim() || undefined,
      check_in_date: draft.check_in_date,
      check_out_date: draft.check_out_date,
      check_in_time: draft.check_in_time || undefined,
      check_out_time: draft.check_out_time || undefined,
      reference_number: draft.reference_number.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      currency: draft.price ? draft.currency : undefined,
      traveller_ids: travellers.map((t) => t.id),
      rooms,
    });
  };

  const fmtDate = (d: string) => {
    try { return parseLocalDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
    catch { return d; }
  };

  return (
    <div className="space-y-3">
      <SetupTip tip={TIPS[holidayType]} />

      {/* Existing stays */}
      {stays.length > 0 && (
        <div className="space-y-2">
          {stays.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white">
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">{s.name}</div>
                <div className="text-xs text-ink-faint">
                  {fmtDate(s.check_in_date)}
                  {s.check_in_time && ` ${s.check_in_time.slice(0, 5)}`}
                  {' → '}
                  {fmtDate(s.check_out_date)}
                  {s.check_out_time && ` ${s.check_out_time.slice(0, 5)}`}
                  {s.reference_number && ` · Ref: ${s.reference_number}`}
                  {s.price != null && ` · ${s.currency ?? ''} ${s.price.toFixed(2)}`}
                </div>
                {s.rooms && s.rooms.length > 0 && (
                  <div className="text-xs text-ink-faint mt-0.5">
                    {s.rooms.length} room{s.rooms.length !== 1 ? 's' : ''}: {s.rooms.map((r) => r.name).join(', ')}
                  </div>
                )}
                {s.address && <div className="text-xs text-ink-faint truncate">{s.address}</div>}
              </div>
              <button
                type="button"
                onClick={() => { if (confirm(`Remove ${s.name}?`)) deleteMutation.mutate(s.id); }}
                className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Draft row */}
      <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-2">
        <PlaceAutocomplete
          searchType="hotel"
          placeholder="Hotel / stay name (e.g. Hilton Faro)"
          value={draft.name}
          onChange={(val) => setDraft({ ...draft, name: val })}
          onSelect={(s) => setDraft((d) => ({ ...d, name: s.name, address: s.address ?? d.address }))}
        />
        <input
          className="vintage-input w-full"
          placeholder="Address (auto-filled or type manually)"
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
        />

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-ink-faint mb-1">Check-in date</label>
            <input
              type="date" className="vintage-input w-full"
              value={draft.check_in_date}
              onChange={(e) => setDraft({ ...draft, check_in_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Check-out date</label>
            <input
              type="date" className="vintage-input w-full"
              value={draft.check_out_date}
              onChange={(e) => setDraft({ ...draft, check_out_date: e.target.value })}
            />
          </div>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-ink-faint mb-1">Check-in time <span className="text-ink-faint font-normal">(optional)</span></label>
            <input
              type="time" className="vintage-input w-full"
              value={draft.check_in_time}
              onChange={(e) => setDraft({ ...draft, check_in_time: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Check-out time <span className="text-ink-faint font-normal">(optional)</span></label>
            <input
              type="time" className="vintage-input w-full"
              value={draft.check_out_time}
              onChange={(e) => setDraft({ ...draft, check_out_time: e.target.value })}
            />
          </div>
        </div>

        <input
          className="vintage-input w-full"
          placeholder="Booking ref / confirmation number (optional)"
          value={draft.reference_number}
          onChange={(e) => setDraft({ ...draft, reference_number: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number" step="0.01" min="0"
            placeholder="Total price"
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

        {/* Rooms section */}
        {travellers.length > 0 && (
          <div className="pt-1 border-t border-parchment-dark">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-navy"
                checked={showRooms}
                onChange={(e) => {
                  setShowRooms(e.target.checked);
                  if (!e.target.checked) setDraft((d) => ({ ...d, rooms: [] }));
                }}
              />
              <span className="text-xs font-semibold text-ink flex items-center gap-1">
                <BedDouble size={12} className="text-navy" />
                Split into rooms
              </span>
            </label>

            {showRooms && (
              <div className="mt-2 space-y-2">
                {draft.rooms.map((room, idx) => {
                  const taken = assignedInRooms(room.key);
                  return (
                    <div key={room.key} className="border border-parchment-dark rounded-lg p-2.5 space-y-2 bg-white">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">Room {idx + 1}</span>
                        <button type="button" onClick={() => removeRoom(room.key)} className="text-ink-faint hover:text-terracotta">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <input
                        className="vintage-input w-full text-sm"
                        placeholder="Room name (e.g. Double Room)"
                        value={room.name}
                        onChange={(e) => updateRoom(room.key, { name: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number" step="0.01" min="0"
                          className="vintage-input text-sm"
                          placeholder="Room price"
                          value={room.price}
                          onChange={(e) => updateRoom(room.key, { price: e.target.value })}
                        />
                        <select
                          className="vintage-input text-sm"
                          value={room.currency}
                          onChange={(e) => updateRoom(room.key, { currency: e.target.value })}
                        >
                          <option value="GBP">GBP</option>
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-faint font-semibold uppercase tracking-wider mb-1.5">Who's in this room?</p>
                        <div className="flex flex-wrap gap-1.5">
                          {travellers.map((t) => {
                            const sel = room.traveller_ids.includes(t.id);
                            const disabled = !sel && taken.has(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => !disabled && toggleRoomTraveller(room.key, t.id)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                                  sel ? 'border-navy bg-navy/10 text-navy' :
                                  disabled ? 'border-parchment-dark bg-parchment text-ink-faint opacity-40 cursor-not-allowed' :
                                  'border-parchment-dark bg-white text-ink-faint hover:border-navy/40'
                                }`}
                              >
                                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold"
                                  style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0)}</span>
                                {t.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addRoom}
                  className="text-xs text-navy hover:underline flex items-center gap-1 font-body"
                >
                  <Plus size={12} /> Add room
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={saveDraft}
          disabled={!draft.name.trim() || !draft.check_in_date || !draft.check_out_date || createMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2.5} /> Add stay
        </button>
      </div>

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}
      <p className="text-xs text-ink-faint">
        {stays.length} {stays.length === 1 ? 'stay' : 'stays'} added
      </p>
    </div>
  );
}
