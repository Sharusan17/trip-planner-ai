import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { transportApi } from '../api/transport';
import { travellersApi } from '../api/travellers';
import type { TransportBooking, Vehicle } from '@trip-planner-ai/shared';
import { TRANSPORT_ICONS } from '@trip-planner-ai/shared';
import FlightLiveStatus from '../components/transport/FlightLiveStatus';

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

type AssignTarget = { vehicleId: string; slotIndex: number } | null;

export default function TransportPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'bookings' | 'cars'>('bookings');
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

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => transportApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport', currentTrip?.id] }),
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

  function handleSeatAssign(vehicleId: string, travellerId: string) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const currentSeats = vehicle.seats
      .filter((s) => s.traveller_id !== travellerId)
      .map((s) => ({ traveller_id: s.traveller_id, seat_label: s.seat_label ?? undefined }));
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
          <button className="btn-primary" onClick={() => navigate('/logistics/transport/add')}>
            + Add Booking
          </button>
        )}
        {isOrganiser && activeTab === 'cars' && (
          <button className="btn-primary" onClick={() => navigate('/logistics/vehicles/add')}>
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
                <button className="btn-primary mt-4" onClick={() => navigate('/logistics/transport/add')}>
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
                              {b.from_location}{b.departure_terminal ? ` T${b.departure_terminal}` : ''}
                              {' → '}
                              {b.to_location}{b.arrival_terminal ? ` T${b.arrival_terminal}` : ''}
                            </p>
                            <p className="text-sm text-ink/60">
                              {b.airline && <span className="mr-1">{b.airline} ·</span>}
                              {formatDateTime(b.departure_time)}
                              {b.arrival_time && ` → ${formatDateTime(b.arrival_time)}`}
                              {b.aircraft_type && ` · ${b.aircraft_type}`}
                            </p>
                            {b.transport_type === 'flight' && b.reference_number && (
                              <FlightLiveStatus
                                flightIata={b.reference_number.toUpperCase().replace(/\s+/g, '')}
                                departureISO={b.departure_time}
                              />
                            )}
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
                          <button onClick={() => navigate(`/logistics/transport/${b.id}/edit`)} className="btn-secondary text-xs py-1 px-3">Edit</button>
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
                <button className="btn-primary mt-4" onClick={() => navigate('/logistics/vehicles/add')}>
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
                          <button onClick={() => navigate(`/logistics/vehicles/${v.id}/edit`)} className="btn-secondary text-xs py-1 px-3">Edit</button>
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

    </div>
  );
}
