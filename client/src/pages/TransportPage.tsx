import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { transportApi } from '../api/transport';
import { travellersApi } from '../api/travellers';
import type {
  TransportBooking, Vehicle, TransportType,
  CreateTransportInput, CreateVehicleInput,
} from '@trip-planner-ai/shared';
import { TRANSPORT_ICONS } from '@trip-planner-ai/shared';

const TRANSPORT_TYPES: TransportType[] = ['flight', 'train', 'bus', 'car', 'ferry', 'other'];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

interface BookingForm {
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

const emptyBookingForm: BookingForm = {
  transport_type: 'flight', from_location: '', to_location: '',
  departure_time: '', arrival_time: '', reference_number: '',
  price: '', currency: 'EUR', notes: '', traveller_ids: [],
};

interface VehicleForm {
  name: string;
  seat_count: string;
  notes: string;
}
const emptyVehicleForm: VehicleForm = { name: '', seat_count: '5', notes: '' };

type AssignTarget = { vehicleId: string; slotIndex: number } | null;

export default function TransportPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'bookings' | 'cars'>('bookings');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [editingBooking, setEditingBooking] = useState<TransportBooking | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingForm>(emptyBookingForm);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleForm>(emptyVehicleForm);
  const [assignTarget, setAssignTarget] = useState<AssignTarget>(null);

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['transport', currentTrip?.id],
    queryFn: () => transportApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicles', currentTrip?.id],
    queryFn: () => transportApi.listVehicles(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createBookingMutation = useMutation({
    mutationFn: (data: CreateTransportInput) => transportApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport', currentTrip?.id] }); closeBookingForm(); },
  });

  const updateBookingMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTransportInput> }) =>
      transportApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport', currentTrip?.id] }); closeBookingForm(); },
  });

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => transportApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport', currentTrip?.id] }),
  });

  const createVehicleMutation = useMutation({
    mutationFn: (data: CreateVehicleInput) => transportApi.createVehicle(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles', currentTrip?.id] }); closeVehicleForm(); },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateVehicleInput> }) =>
      transportApi.updateVehicle(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles', currentTrip?.id] }); closeVehicleForm(); },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (id: string) => transportApi.deleteVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles', currentTrip?.id] }),
  });

  const assignSeatMutation = useMutation({
    mutationFn: ({ vehicleId, seats }: { vehicleId: string; seats: { traveller_id: string; seat_label?: string }[] }) =>
      transportApi.assignSeats(vehicleId, { seats }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles', currentTrip?.id] }); setAssignTarget(null); },
  });

  function closeBookingForm() {
    setShowBookingForm(false);
    setEditingBooking(null);
    setBookingForm(emptyBookingForm);
  }

  function closeVehicleForm() {
    setShowVehicleForm(false);
    setEditingVehicle(null);
    setVehicleForm(emptyVehicleForm);
  }

  function openEditBooking(b: TransportBooking) {
    setEditingBooking(b);
    setBookingForm({
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
    setShowBookingForm(true);
  }

  function openEditVehicle(v: Vehicle) {
    setEditingVehicle(v);
    setVehicleForm({ name: v.name, seat_count: String(v.seat_count), notes: v.notes ?? '' });
    setShowVehicleForm(true);
  }

  function toggleTravellerBooking(id: string) {
    setBookingForm((f) => ({
      ...f,
      traveller_ids: f.traveller_ids.includes(id)
        ? f.traveller_ids.filter((t) => t !== id)
        : [...f.traveller_ids, id],
    }));
  }

  function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateTransportInput = {
      transport_type: bookingForm.transport_type,
      from_location: bookingForm.from_location,
      to_location: bookingForm.to_location,
      departure_time: bookingForm.departure_time,
      arrival_time: bookingForm.arrival_time || undefined,
      reference_number: bookingForm.reference_number || undefined,
      price: bookingForm.price ? parseFloat(bookingForm.price) : undefined,
      currency: bookingForm.currency || undefined,
      notes: bookingForm.notes || undefined,
      traveller_ids: bookingForm.traveller_ids,
    };
    if (editingBooking) {
      updateBookingMutation.mutate({ id: editingBooking.id, data });
    } else {
      createBookingMutation.mutate(data);
    }
  }

  function handleVehicleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateVehicleInput = {
      name: vehicleForm.name,
      seat_count: parseInt(vehicleForm.seat_count) || 5,
      notes: vehicleForm.notes || undefined,
    };
    if (editingVehicle) {
      updateVehicleMutation.mutate({ id: editingVehicle.id, data });
    } else {
      createVehicleMutation.mutate(data);
    }
  }

  function handleSeatAssign(vehicleId: string, travellerId: string) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const currentSeats = vehicle.seats.filter((s) => s.traveller_id !== travellerId);
    const newSeats = [...currentSeats, { traveller_id: travellerId }];
    assignSeatMutation.mutate({ vehicleId, seats: newSeats });
  }

  function handleSeatRemove(vehicleId: string, travellerId: string) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const newSeats = vehicle.seats
      .filter((s) => s.traveller_id !== travellerId)
      .map((s) => ({ traveller_id: s.traveller_id, seat_label: s.seat_label ?? undefined }));
    assignSeatMutation.mutate({ vehicleId, seats: newSeats });
  }

  const assignedInVehicle = (vehicleId: string) =>
    vehicles.find((v) => v.id === vehicleId)?.seats.map((s) => s.traveller_id) ?? [];

  if (!currentTrip) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-navy">Transport</h1>
        {isOrganiser && activeTab === 'bookings' && (
          <button className="btn-primary"
            onClick={() => { setEditingBooking(null); setBookingForm(emptyBookingForm); setShowBookingForm(true); }}>
            + Add Booking
          </button>
        )}
        {isOrganiser && activeTab === 'cars' && (
          <button className="btn-primary"
            onClick={() => { setEditingVehicle(null); setVehicleForm(emptyVehicleForm); setShowVehicleForm(true); }}>
            + Add Vehicle
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['bookings', 'cars'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-navy text-parchment' : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/50'
            }`}
          >
            {tab === 'bookings' ? '✈️ Bookings' : '🚗 Car Planner'}
          </button>
        ))}
      </div>

      {/* Bookings tab */}
      {activeTab === 'bookings' && (
        <>
          {loadingBookings ? (
            <p className="text-ink/50 text-center py-8">Loading bookings...</p>
          ) : bookings.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">✈️</p>
              <p className="text-ink/60">No transport bookings yet.</p>
              {isOrganiser && (
                <button className="btn-primary mt-4"
                  onClick={() => { setEditingBooking(null); setBookingForm(emptyBookingForm); setShowBookingForm(true); }}>
                  Add first booking
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((b) => {
                const travellerAvatars = b.traveller_ids
                  .map((id) => travellers.find((t) => t.id === id))
                  .filter(Boolean);
                return (
                  <div key={b.id} className="vintage-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{TRANSPORT_ICONS[b.transport_type]}</span>
                          <div>
                            <p className="font-semibold text-ink">
                              {b.from_location} → {b.to_location}
                            </p>
                            <p className="text-sm text-ink/60">{formatDateTime(b.departure_time)}
                              {b.arrival_time && ` → ${formatDateTime(b.arrival_time)}`}
                            </p>
                          </div>
                        </div>
                        {b.reference_number && (
                          <p className="text-sm text-ink/60">
                            Ref: <span className="font-mono">{b.reference_number}</span>
                          </p>
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
                        {travellerAvatars.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {travellerAvatars.map((t) => t && (
                              <span
                                key={t.id}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: t.avatar_colour }}
                                title={t.name}
                              >
                                {t.name.charAt(0).toUpperCase()}
                              </span>
                            ))}
                          </div>
                        )}
                        {b.notes && <p className="text-sm text-ink/50 mt-1 italic">{b.notes}</p>}
                      </div>
                      {isOrganiser && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <button onClick={() => openEditBooking(b)} className="btn-secondary text-xs py-1 px-3">Edit</button>
                          <button
                            onClick={() => { if (confirm('Delete this booking?')) deleteBookingMutation.mutate(b.id); }}
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
        </>
      )}

      {/* Car planner tab */}
      {activeTab === 'cars' && (
        <>
          {loadingVehicles ? (
            <p className="text-ink/50 text-center py-8">Loading vehicles...</p>
          ) : vehicles.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">🚗</p>
              <p className="text-ink/60">No vehicles added yet.</p>
              {isOrganiser && (
                <button className="btn-primary mt-4"
                  onClick={() => { setEditingVehicle(null); setVehicleForm(emptyVehicleForm); setShowVehicleForm(true); }}>
                  Add vehicle
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {vehicles.map((v) => {
                const assigned = assignedInVehicle(v.id);
                const unassigned = travellers.filter((t) => !assigned.includes(t.id));
                return (
                  <div key={v.id} className="vintage-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-ink text-lg">🚗 {v.name}</h3>
                        <p className="text-sm text-ink/60">{v.seat_count} seats</p>
                      </div>
                      {isOrganiser && (
                        <div className="flex gap-2">
                          <button onClick={() => openEditVehicle(v)} className="btn-secondary text-xs py-1 px-3">Edit</button>
                          <button
                            onClick={() => { if (confirm('Delete this vehicle?')) deleteVehicleMutation.mutate(v.id); }}
                            className="btn-danger text-xs py-1 px-3"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Assigned seats */}
                    <div className="mb-3">
                      <p className="text-xs font-medium text-ink/60 mb-2">Passengers ({v.seats.length}/{v.seat_count})</p>
                      <div className="flex flex-wrap gap-2">
                        {v.seats.map((seat) => {
                          const t = travellers.find((tr) => tr.id === seat.traveller_id);
                          if (!t) return null;
                          return (
                            <div key={seat.id} className="flex items-center gap-1.5 bg-parchment-dark/20 rounded-full px-3 py-1">
                              <span
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: t.avatar_colour }}
                              >
                                {t.name.charAt(0).toUpperCase()}
                              </span>
                              <span className="text-sm text-ink">{t.name}</span>
                              {isOrganiser && (
                                <button
                                  onClick={() => handleSeatRemove(v.id, t.id)}
                                  className="text-ink/40 hover:text-terracotta text-xs ml-1"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {/* Empty seats */}
                        {Array.from({ length: Math.max(0, v.seat_count - v.seats.length) }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="flex items-center gap-1 border-2 border-dashed border-ink/20 rounded-full px-3 py-1 text-sm text-ink/30"
                          >
                            Empty seat
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Assign unassigned travellers */}
                    {isOrganiser && unassigned.length > 0 && v.seats.length < v.seat_count && (
                      <div>
                        <p className="text-xs font-medium text-ink/60 mb-2">Add passenger:</p>
                        <div className="flex flex-wrap gap-2">
                          {unassigned.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => handleSeatAssign(v.id, t.id)}
                              className="flex items-center gap-1.5 bg-parchment hover:bg-parchment-dark/30 border border-ink/20 rounded-full px-3 py-1 text-sm transition-colors"
                            >
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: t.avatar_colour }}
                              >
                                {t.name.charAt(0).toUpperCase()}
                              </span>
                              {t.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {v.notes && <p className="text-sm text-ink/50 mt-2 italic">{v.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Booking form modal */}
      {showBookingForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="vintage-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editingBooking ? 'Edit Booking' : 'Add Booking'}
            </h2>
            <form onSubmit={handleBookingSubmit} className="space-y-3">
              {/* Transport type */}
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Type</label>
                <div className="flex flex-wrap gap-2">
                  {TRANSPORT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, transport_type: type })}
                      className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors ${
                        bookingForm.transport_type === type
                          ? 'bg-navy text-parchment'
                          : 'bg-parchment-dark/20 text-ink hover:bg-parchment-dark/40'
                      }`}
                    >
                      {TRANSPORT_ICONS[type]} {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">From *</label>
                  <input className="vintage-input w-full" value={bookingForm.from_location}
                    onChange={(e) => setBookingForm({ ...bookingForm, from_location: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">To *</label>
                  <input className="vintage-input w-full" value={bookingForm.to_location}
                    onChange={(e) => setBookingForm({ ...bookingForm, to_location: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Departure *</label>
                  <input type="datetime-local" className="vintage-input w-full" value={bookingForm.departure_time}
                    onChange={(e) => setBookingForm({ ...bookingForm, departure_time: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Arrival</label>
                  <input type="datetime-local" className="vintage-input w-full" value={bookingForm.arrival_time}
                    onChange={(e) => setBookingForm({ ...bookingForm, arrival_time: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Reference Number</label>
                <input className="vintage-input w-full font-mono" value={bookingForm.reference_number}
                  onChange={(e) => setBookingForm({ ...bookingForm, reference_number: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Price</label>
                  <input type="number" step="0.01" min="0" className="vintage-input w-full"
                    value={bookingForm.price}
                    onChange={(e) => setBookingForm({ ...bookingForm, price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Currency</label>
                  <input className="vintage-input w-full uppercase" maxLength={3}
                    value={bookingForm.currency}
                    onChange={(e) => setBookingForm({ ...bookingForm, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Travellers</label>
                <div className="flex flex-wrap gap-2">
                  {travellers.map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" className="accent-navy"
                        checked={bookingForm.traveller_ids.includes(t.id)}
                        onChange={() => toggleTravellerBooking(t.id)} />
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
                <textarea className="vintage-input w-full" rows={2} value={bookingForm.notes}
                  onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createBookingMutation.isPending || updateBookingMutation.isPending}>
                  {editingBooking ? 'Save Changes' : 'Add Booking'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeBookingForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle form modal */}
      {showVehicleForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="vintage-card w-full max-w-md">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
            </h2>
            <form onSubmit={handleVehicleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Vehicle Name *</label>
                <input className="vintage-input w-full" placeholder="e.g. White Peugeot"
                  value={vehicleForm.name}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Number of Seats</label>
                <input type="number" min="1" max="50" className="vintage-input w-full"
                  value={vehicleForm.seat_count}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, seat_count: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea className="vintage-input w-full" rows={2} value={vehicleForm.notes}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createVehicleMutation.isPending || updateVehicleMutation.isPending}>
                  {editingVehicle ? 'Save Changes' : 'Add Vehicle'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeVehicleForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignTarget && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50"
          onClick={() => setAssignTarget(null)} />
      )}
    </div>
  );
}
