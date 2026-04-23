import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { transportApi } from '../api/transport';
import { travellersApi } from '../api/travellers';
import type { TransportBooking, Vehicle } from '@trip-planner-ai/shared';
import { TRANSPORT_ICONS } from '@trip-planner-ai/shared';
import FlightLiveStatus from '../components/transport/FlightLiveStatus';
import { PlaneTakeoff, PlaneLanding, Clock, Link2 } from 'lucide-react';

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

type AssignTarget = { vehicleId: string; slotIndex: number } | null;

/**
 * Group bookings into journey pairs (outbound + return) or singletons.
 * Pairs are identified by linked_booking_id; each pair is only shown once.
 */
function groupJourneys(bookings: TransportBooking[]): Array<{ main: TransportBooking; linked: TransportBooking | null }> {
  const seen = new Set<string>();
  const groups: Array<{ main: TransportBooking; linked: TransportBooking | null }> = [];
  const byId = new Map(bookings.map((b) => [b.id, b]));

  for (const b of bookings) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    if (b.linked_booking_id && !seen.has(b.linked_booking_id)) {
      const linked = byId.get(b.linked_booking_id) ?? null;
      if (linked) {
        seen.add(linked.id);
        groups.push({ main: b, linked });
        continue;
      }
    }
    groups.push({ main: b, linked: null });
  }
  return groups;
}

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
              {groupJourneys(bookings).map(({ main: b, linked }) => {
                const travellerAvatars = b.traveller_ids
                  .map((id) => travellers.find((t) => t.id === id))
                  .filter(Boolean);
                return (
                  <div key={b.id} className={`vintage-card overflow-hidden ${linked ? 'border-2 border-navy/20' : ''}`}>
                    {linked && (
                      <div className="flex items-center gap-1.5 px-4 py-2 bg-navy/5 border-b border-navy/10">
                        <Link2 size={12} className="text-navy" />
                        <span className="text-xs font-semibold text-navy font-body">Outbound + Return</span>
                      </div>
                    )}
                    <div className="p-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header row: icon + airline/type + ref */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl leading-none">{TRANSPORT_ICONS[b.transport_type]}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {b.airline && (
                                <span className="font-semibold text-ink text-sm">{b.airline}</span>
                              )}
                              {b.reference_number && (
                                <span className="font-mono text-xs bg-parchment border border-parchment-dark px-2 py-0.5 rounded text-ink-light">
                                  {b.reference_number}
                                </span>
                              )}
                              {b.aircraft_type && (
                                <span className="text-xs text-ink-faint">{b.aircraft_type}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Route: dep → arr with labelled rows */}
                        <div className="flex items-stretch gap-3 mb-2">
                          {/* Dep column */}
                          <div className="flex flex-col items-center gap-1 pt-0.5">
                            <PlaneTakeoff size={14} className="text-navy flex-shrink-0" />
                            <div className="w-px flex-1 bg-parchment-dark min-h-[20px]" />
                            <PlaneLanding size={14} className="text-gold flex-shrink-0" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            {/* Departure */}
                            <div>
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-ink">
                                  {b.from_location}
                                  {b.departure_terminal && (
                                    <span className="font-normal text-ink-faint text-xs ml-1">· Terminal {b.departure_terminal}</span>
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-ink-faint mt-0.5">
                                <Clock size={10} />
                                {formatDateTime(b.departure_time)}
                              </div>
                            </div>
                            {/* Arrival */}
                            <div>
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-ink">
                                  {b.to_location}
                                  {b.arrival_terminal && (
                                    <span className="font-normal text-ink-faint text-xs ml-1">· Terminal {b.arrival_terminal}</span>
                                  )}
                                </span>
                              </div>
                              {b.arrival_time && (
                                <div className="flex items-center gap-1 text-xs text-ink-faint mt-0.5">
                                  <Clock size={10} />
                                  {formatDateTime(b.arrival_time)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {b.transport_type === 'flight' && b.reference_number && (
                          <FlightLiveStatus
                            flightIata={b.reference_number.toUpperCase().replace(/\s+/g, '')}
                            departureISO={b.departure_time}
                          />
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

                    {/* Linked return leg */}
                    {linked && (() => {
                      const lt = linked;
                      return (
                        <div className="border-t border-navy/10 px-4 py-3 bg-parchment/40 flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-base leading-none">{TRANSPORT_ICONS[lt.transport_type]}</span>
                              {lt.airline && <span className="font-semibold text-ink text-sm">{lt.airline}</span>}
                              {lt.reference_number && (
                                <span className="font-mono text-xs bg-white border border-parchment-dark px-2 py-0.5 rounded text-ink-light">
                                  {lt.reference_number}
                                </span>
                              )}
                            </div>
                            <div className="flex items-stretch gap-3">
                              <div className="flex flex-col items-center gap-1 pt-0.5">
                                <PlaneTakeoff size={13} className="text-navy flex-shrink-0" />
                                <div className="w-px flex-1 bg-parchment-dark min-h-[16px]" />
                                <PlaneLanding size={13} className="text-gold flex-shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0 space-y-2">
                                <div>
                                  <span className="font-semibold text-sm text-ink">
                                    {lt.from_location}
                                    {lt.departure_terminal && <span className="font-normal text-ink-faint text-xs ml-1">· T{lt.departure_terminal}</span>}
                                  </span>
                                  <div className="flex items-center gap-1 text-xs text-ink-faint mt-0.5">
                                    <Clock size={10} />{formatDateTime(lt.departure_time)}
                                  </div>
                                </div>
                                <div>
                                  <span className="font-semibold text-sm text-ink">
                                    {lt.to_location}
                                    {lt.arrival_terminal && <span className="font-normal text-ink-faint text-xs ml-1">· T{lt.arrival_terminal}</span>}
                                  </span>
                                  {lt.arrival_time && (
                                    <div className="flex items-center gap-1 text-xs text-ink-faint mt-0.5">
                                      <Clock size={10} />{formatDateTime(lt.arrival_time)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            {lt.price && lt.currency && (
                              <p className="text-sm font-semibold text-navy mt-1.5">
                                {formatCurrency(lt.price, lt.currency)}
                              </p>
                            )}
                          </div>
                          {isOrganiser && (
                            <div className="flex flex-col gap-2 shrink-0">
                              <button onClick={() => navigate(`/logistics/transport/${lt.id}/edit`)} className="btn-secondary text-xs py-1 px-3">Edit</button>
                              <button
                                onClick={() => { if (confirm('Delete this booking?')) deleteBookingMutation.mutate(lt.id); }}
                                className="btn-danger text-xs py-1 px-3"
                              >Delete</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
