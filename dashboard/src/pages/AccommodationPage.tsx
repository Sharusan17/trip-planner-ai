import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { accommodationApi } from '../api/accommodation';
import { travellersApi } from '../api/travellers';
import type { AccommodationBooking } from '@trip-planner-ai/shared';
import { parseLocalDate } from '@/utils/date';
import { BedDouble } from 'lucide-react';

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function nightCount(checkIn: string, checkOut: string): number {
  const a = parseLocalDate(checkIn);
  const b = parseLocalDate(checkOut);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: string) {
  return parseLocalDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AccommodationPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accommodationApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accommodation', currentTrip?.id] }),
  });

  // Timeline: visual bar relative to trip dates
  const tripStart = currentTrip ? parseLocalDate(currentTrip.start_date).getTime() : 0;
  const tripEnd = currentTrip ? parseLocalDate(currentTrip.end_date).getTime() : 1;
  const tripDuration = tripEnd - tripStart || 1;

  const PALETTE = ['#1B3A5C', '#C65D3E', '#B8963E', '#2D6A4F', '#7B4F2E'];

  if (!currentTrip) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-navy">Accommodation</h1>
        {isOrganiser && (
          <button className="btn-primary" onClick={() => navigate('/logistics/stays/add')}>
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
              const start = Math.max(0, (parseLocalDate(b.check_in_date).getTime() - tripStart) / tripDuration);
              const end = Math.min(1, (parseLocalDate(b.check_out_date).getTime() - tripStart) / tripDuration);
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
            <button className="btn-primary mt-4" onClick={() => navigate('/logistics/stays/add')}>
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
                    {/* Dates + nights */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm text-ink-light">
                        {formatDate(b.check_in_date)}
                        {b.check_in_time && <span className="text-ink-faint ml-1 text-xs">{b.check_in_time.slice(0,5)}</span>}
                        {' → '}
                        {formatDate(b.check_out_date)}
                        {b.check_out_time && <span className="text-ink-faint ml-1 text-xs">{b.check_out_time.slice(0,5)}</span>}
                      </span>
                      <span className="badge badge-navy">{nights} night{nights !== 1 ? 's' : ''}</span>
                    </div>

                    {b.reference_number && (
                      <p className="text-sm text-ink-faint mb-1">Ref: <span className="font-mono">{b.reference_number}</span></p>
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

                    {/* Rooms */}
                    {b.rooms && b.rooms.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {b.rooms.map((room) => {
                          const roomTravs = room.traveller_ids
                            .map((tid) => travellers.find((t) => t.id === tid))
                            .filter(Boolean);
                          return (
                            <div key={room.id} className="flex items-center gap-2 bg-parchment/60 rounded-lg px-3 py-1.5 border border-parchment-dark">
                              <BedDouble size={13} className="text-ink-faint flex-shrink-0" />
                              <span className="text-xs font-semibold text-ink flex-1 truncate">{room.name}</span>
                              {room.price && room.currency && (
                                <span className="text-xs text-ink-faint">{formatCurrency(room.price, room.currency)}</span>
                              )}
                              <div className="flex gap-1 ml-1">
                                {roomTravs.map((t) => t && (
                                  <span key={t.id}
                                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold text-white flex-shrink-0"
                                    style={{ backgroundColor: t.avatar_colour }}
                                    title={t.name}>{t.name.charAt(0).toUpperCase()}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Overall travellers (only show if no rooms defined) */}
                    {(!b.rooms || b.rooms.length === 0) && travellerNames.length > 0 && (
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
                      <button onClick={() => navigate(`/logistics/stays/${b.id}/edit`)} className="btn-secondary text-xs py-1 px-3">Edit</button>
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

    </div>
  );
}
