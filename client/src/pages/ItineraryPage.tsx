import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType, type ItineraryDay, type Activity } from '@trip-planner-ai/shared';

const ACTIVITY_TYPES: ActivityType[] = [
  'flight', 'transport', 'hotel', 'food', 'sightseeing', 'beach', 'shopping', 'entertainment', 'custom',
];

export default function ItineraryPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const queryClient = useQueryClient();
  const [showDayForm, setShowDayForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Day form
  const [dayDate, setDayDate] = useState('');
  const [dayTitle, setDayTitle] = useState('');

  // Activity form
  const [actTime, setActTime] = useState('');
  const [actType, setActType] = useState<ActivityType>('custom');
  const [actDesc, setActDesc] = useState('');
  const [actLocation, setActLocation] = useState('');
  const [actLat, setActLat] = useState('');
  const [actLng, setActLng] = useState('');
  const [actKidFriendly, setActKidFriendly] = useState(true);

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createDayMutation = useMutation({
    mutationFn: () => itineraryApi.createDay(currentTrip!.id, {
      date: dayDate,
      day_number: days.length + 1,
      title: dayTitle || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['days'] }); setShowDayForm(false); setDayDate(''); setDayTitle(''); },
  });

  const deleteDayMutation = useMutation({
    mutationFn: (id: string) => itineraryApi.deleteDay(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['days'] }),
  });

  const createActivityMutation = useMutation({
    mutationFn: (dayId: string) => itineraryApi.createActivity(dayId, {
      time: actTime || undefined,
      type: actType,
      description: actDesc,
      location_tag: actLocation || undefined,
      latitude: actLat ? parseFloat(actLat) : undefined,
      longitude: actLng ? parseFloat(actLng) : undefined,
      kid_friendly: actKidFriendly,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['days'] }); resetActivityForm(); },
  });

  const updateActivityMutation = useMutation({
    mutationFn: () => itineraryApi.updateActivity(editingActivity!.id, {
      time: actTime || undefined,
      type: actType,
      description: actDesc,
      location_tag: actLocation || undefined,
      latitude: actLat ? parseFloat(actLat) : undefined,
      longitude: actLng ? parseFloat(actLng) : undefined,
      kid_friendly: actKidFriendly,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['days'] }); resetActivityForm(); },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (id: string) => itineraryApi.deleteActivity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['days'] }),
  });

  const resetActivityForm = () => {
    setShowActivityForm(null);
    setEditingActivity(null);
    setActTime(''); setActType('custom'); setActDesc(''); setActLocation('');
    setActLat(''); setActLng(''); setActKidFriendly(true);
  };

  const openEditActivity = (a: Activity, dayId: string) => {
    setEditingActivity(a);
    setShowActivityForm(dayId);
    setActTime(a.time || '');
    setActType(a.type);
    setActDesc(a.description);
    setActLocation(a.location_tag || '');
    setActLat(a.latitude?.toString() || '');
    setActLng(a.longitude?.toString() || '');
    setActKidFriendly(a.kid_friendly);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-navy">Itinerary</h2>
        {isOrganiser && (
          <button onClick={() => setShowDayForm(true)} className="btn-primary">+ Add Day</button>
        )}
      </div>

      {/* Day timeline */}
      <div className="space-y-4">
        {days.map((day) => (
          <div key={day.id} className="vintage-card overflow-hidden">
            {/* Day header */}
            <button
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-parchment-dark/20 transition-colors"
              onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
            >
              <div className="bg-navy text-parchment-light w-12 h-12 rounded-sm flex flex-col items-center justify-center shrink-0">
                <span className="text-xs font-display">Day</span>
                <span className="text-lg font-bold font-display leading-none">{day.day_number}</span>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-semibold">
                  {day.title || `Day ${day.day_number}`}
                </h3>
                <p className="text-sm text-ink-faint">
                  {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}{day.activities.length} activit{day.activities.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
              <span className="text-ink-faint text-lg">
                {expandedDay === day.id ? '▲' : '▼'}
              </span>
            </button>

            {/* Expanded activities */}
            {expandedDay === day.id && (
              <div className="border-t border-gold/20">
                {day.activities.length === 0 ? (
                  <div className="p-6 text-center text-ink-faint text-sm">
                    No activities yet — add some below
                  </div>
                ) : (
                  <div className="divide-y divide-gold/10">
                    {day.activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 p-4 hover:bg-parchment-dark/10 transition-colors">
                        <div className="text-2xl shrink-0 mt-0.5">
                          {ACTIVITY_ICONS[a.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {a.time && (
                              <span className="font-mono text-xs bg-navy/10 px-1.5 py-0.5 rounded-sm text-navy">
                                {a.time.slice(0, 5)}
                              </span>
                            )}
                            <span className="font-display font-semibold">{a.description}</span>
                            {a.kid_friendly && <span className="text-xs">👶</span>}
                          </div>
                          {a.location_tag && (
                            <p className="text-xs text-ink-faint mt-0.5">📍 {a.location_tag}</p>
                          )}
                        </div>
                        {isOrganiser && (
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => openEditActivity(a, day.id)} className="text-xs text-navy">Edit</button>
                            <button
                              onClick={() => { if (confirm('Delete activity?')) deleteActivityMutation.mutate(a.id); }}
                              className="text-xs text-terracotta"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Day notes */}
                {day.notes && (
                  <div className="px-4 py-3 bg-gold/5 border-t border-gold/10">
                    <p className="text-sm text-ink-light">📝 {day.notes}</p>
                  </div>
                )}

                {/* Day actions */}
                {isOrganiser && (
                  <div className="flex items-center justify-between p-3 bg-parchment-dark/20 border-t border-gold/10">
                    <button
                      onClick={() => { resetActivityForm(); setShowActivityForm(day.id); }}
                      className="btn-primary text-sm py-1.5"
                    >
                      + Add Activity
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete Day ${day.day_number}?`)) deleteDayMutation.mutate(day.id); }}
                      className="text-xs text-terracotta"
                    >
                      Delete Day
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {days.length === 0 && (
        <div className="vintage-card p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No days planned yet</h3>
          <p className="text-sm text-ink-faint">Start building your itinerary day by day</p>
        </div>
      )}

      {/* Add Day modal */}
      {showDayForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowDayForm(false)}>
          <div className="vintage-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-navy mb-4">Add Day</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Date *</label>
                <input className="vintage-input" type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Title</label>
                <input className="vintage-input" placeholder="e.g. Arrival & Old Town" value={dayTitle} onChange={(e) => setDayTitle(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDayForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => createDayMutation.mutate()} className="btn-primary flex-1">Add Day</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Activity modal */}
      {showActivityForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={resetActivityForm}>
          <div className="vintage-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-navy mb-4">
              {editingActivity ? 'Edit Activity' : 'Add Activity'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Type</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setActType(t)}
                      className={`px-3 py-1.5 rounded-sm text-sm font-display transition-all ${
                        actType === t ? 'bg-navy text-parchment-light' : 'bg-parchment-dark/50 text-ink-light hover:bg-parchment-dark'
                      }`}
                    >
                      {ACTIVITY_ICONS[t]} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Description *</label>
                <input className="vintage-input" placeholder="What's happening?" value={actDesc} onChange={(e) => setActDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">Time</label>
                  <input className="vintage-input" type="time" value={actTime} onChange={(e) => setActTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">Location</label>
                  <input className="vintage-input" placeholder="e.g. Faro Old Town" value={actLocation} onChange={(e) => setActLocation(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">Latitude</label>
                  <input className="vintage-input" type="number" step="any" value={actLat} onChange={(e) => setActLat(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">Longitude</label>
                  <input className="vintage-input" type="number" step="any" value={actLng} onChange={(e) => setActLng(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={actKidFriendly} onChange={(e) => setActKidFriendly(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-display">Kid-friendly 👶</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={resetActivityForm} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => editingActivity ? updateActivityMutation.mutate() : createActivityMutation.mutate(showActivityForm)}
                className="btn-primary flex-1"
              >
                {editingActivity ? 'Save' : 'Add Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
