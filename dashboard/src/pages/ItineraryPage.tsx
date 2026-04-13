import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType, type Activity } from '@trip-planner-ai/shared';
import { Plus, Trash2, Pencil, MapPin, Baby, CalendarDays } from 'lucide-react';

const ACTIVITY_TYPES: ActivityType[] = [
  'flight', 'transport', 'hotel', 'food', 'sightseeing', 'beach', 'shopping', 'entertainment', 'custom',
];

const ACTIVITY_COLOURS: Record<ActivityType, { bg: string; text: string; border: string }> = {
  flight:        { bg: 'bg-blue-50',   text: 'text-blue-600',   border: '#3B82F6' },
  transport:     { bg: 'bg-slate-50',  text: 'text-slate-500',  border: '#64748B' },
  hotel:         { bg: 'bg-purple-50', text: 'text-purple-600', border: '#8B5CF6' },
  food:          { bg: 'bg-orange-50', text: 'text-orange-500', border: '#F97316' },
  sightseeing:   { bg: 'bg-emerald-50',text: 'text-emerald-600',border: '#10B981' },
  beach:         { bg: 'bg-cyan-50',   text: 'text-cyan-600',   border: '#06B6D4' },
  shopping:      { bg: 'bg-pink-50',   text: 'text-pink-500',   border: '#EC4899' },
  entertainment: { bg: 'bg-amber-50',  text: 'text-amber-600',  border: '#F59E0B' },
  custom:        { bg: 'bg-gray-50',   text: 'text-gray-500',   border: '#94A3B8' },
};

export default function ItineraryPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const queryClient = useQueryClient();
  const [showDayForm, setShowDayForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const [dayDate, setDayDate] = useState('');
  const [dayTitle, setDayTitle] = useState('');

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

  const activeDay = days.find((d) => d.id === (selectedDayId ?? days[0]?.id)) ?? days[0] ?? null;

  const createDayMutation = useMutation({
    mutationFn: () => itineraryApi.createDay(currentTrip!.id, {
      date: dayDate,
      day_number: days.length + 1,
      title: dayTitle || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days'] });
      setShowDayForm(false);
      setDayDate('');
      setDayTitle('');
    },
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-navy">Itinerary</h2>
        {isOrganiser && (
          <button onClick={() => setShowDayForm(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} strokeWidth={2.5} />
            Add Day
          </button>
        )}
      </div>

      {days.length === 0 ? (
        <div className="vintage-card p-12 text-center">
          <CalendarDays size={36} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No days planned yet</h3>
          <p className="text-sm text-ink-faint">Start building your itinerary day by day</p>
        </div>
      ) : (
        <>
          {/* Day tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
            {days.map((day) => {
              const isActive = day.id === (selectedDayId ?? days[0]?.id);
              return (
                <button
                  key={day.id}
                  onClick={() => setSelectedDayId(day.id)}
                  className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-left transition-all border ${
                    isActive
                      ? 'bg-navy border-navy text-white shadow-sm'
                      : 'bg-white border-parchment-dark text-ink hover:border-navy/30'
                  }`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? 'text-white/60' : 'text-ink-faint'}`}>
                    Day {day.day_number}
                  </div>
                  <div className={`text-sm font-semibold font-display mt-0.5 ${isActive ? 'text-white' : 'text-ink'}`}>
                    {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active day panel */}
          {activeDay && (
            <div className="vintage-card overflow-hidden">
              {/* Day header */}
              <div className="px-5 pt-5 pb-4 border-b border-parchment-dark">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold text-navy">
                      {activeDay.title || `Day ${activeDay.day_number}`}
                    </h3>
                    <p className="text-sm text-ink-faint mt-0.5">
                      {new Date(activeDay.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      {' · '}{activeDay.activities.length} activit{activeDay.activities.length === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                  {isOrganiser && (
                    <button
                      onClick={() => { if (confirm(`Delete Day ${activeDay.day_number}?`)) deleteDayMutation.mutate(activeDay.id); }}
                      className="p-1.5 -mr-1 text-ink-faint hover:text-terracotta transition-colors rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {activeDay.notes && (
                  <p className="text-sm text-ink-light mt-2.5 bg-parchment/60 rounded-lg px-3 py-2 border border-parchment-dark">
                    {activeDay.notes}
                  </p>
                )}
              </div>

              {/* Activity timeline */}
              <div className="px-5 py-4">
                {activeDay.activities.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-ink-faint">No activities yet</p>
                  </div>
                ) : (
                  <div className="relative">
                    {activeDay.activities.length > 1 && (
                      <div className="absolute left-[17px] top-10 bottom-8 w-px border-l-2 border-dashed border-parchment-dark pointer-events-none" />
                    )}
                    <div className="space-y-3">
                      {activeDay.activities.map((a) => {
                        const colour = ACTIVITY_COLOURS[a.type];
                        return (
                          <div key={a.id} className="flex gap-3 items-start">
                            {/* Icon circle */}
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${colour.bg}`}
                              style={{ border: `2px solid ${colour.border}30` }}
                            >
                              <span className="text-base leading-none">{ACTIVITY_ICONS[a.type]}</span>
                            </div>
                            {/* Activity card */}
                            <div className="flex-1 bg-parchment/40 rounded-xl border border-parchment-dark px-3.5 py-2.5 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-ink text-sm leading-snug">{a.description}</p>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    {a.location_tag && (
                                      <span className="flex items-center gap-1 text-xs text-ink-faint">
                                        <MapPin size={10} />
                                        {a.location_tag}
                                      </span>
                                    )}
                                    {a.kid_friendly && (
                                      <span className="flex items-center gap-1 text-xs text-ink-faint">
                                        <Baby size={10} />
                                        Kid-friendly
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {a.time && (
                                    <span className="text-xs text-ink-light font-mono bg-white border border-parchment-dark px-2 py-0.5 rounded-full">
                                      {a.time.slice(0, 5)}
                                    </span>
                                  )}
                                  {isOrganiser && (
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => openEditActivity(a, activeDay.id)}
                                        className="w-6 h-6 rounded-full bg-white border border-parchment-dark flex items-center justify-center text-ink-faint hover:text-navy transition-colors"
                                      >
                                        <Pencil size={11} />
                                      </button>
                                      <button
                                        onClick={() => { if (confirm('Delete activity?')) deleteActivityMutation.mutate(a.id); }}
                                        className="w-6 h-6 rounded-full bg-white border border-parchment-dark flex items-center justify-center text-ink-faint hover:text-terracotta transition-colors"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isOrganiser && (
                  <button
                    onClick={() => { resetActivityForm(); setShowActivityForm(activeDay.id); }}
                    className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-parchment-dark text-sm text-ink-faint hover:border-navy/30 hover:text-navy transition-colors"
                  >
                    <Plus size={14} />
                    Add Activity
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Day modal */}
      {showDayForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onClick={() => setShowDayForm(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-[var(--shadow-elevated)] w-full max-w-md p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink mb-4">Add Day</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Date *</label>
                <input className="vintage-input" type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Title (optional)</label>
                <input className="vintage-input" placeholder="e.g. Arrival & Old Town" value={dayTitle} onChange={(e) => setDayTitle(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowDayForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => createDayMutation.mutate()} disabled={!dayDate} className="btn-primary flex-1 disabled:opacity-50">
                Add Day
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Activity modal */}
      {showActivityForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onClick={resetActivityForm}>
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-[var(--shadow-elevated)] w-full max-w-md p-5 sm:p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink mb-4">
              {editingActivity ? 'Edit Activity' : 'Add Activity'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-2">Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ACTIVITY_TYPES.map((t) => {
                    const c = ACTIVITY_COLOURS[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActType(t)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${
                          actType === t
                            ? `${c.bg} ${c.text} border-current`
                            : 'bg-white border-parchment-dark text-ink-faint hover:bg-parchment/50'
                        }`}
                      >
                        <span>{ACTIVITY_ICONS[t]}</span>
                        <span className="capitalize">{t}</span>
                      </button>
                    );
                  })}
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
                  <input className="vintage-input" placeholder="e.g. Old Town" value={actLocation} onChange={(e) => setActLocation(e.target.value)} />
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
                <input type="checkbox" checked={actKidFriendly} onChange={(e) => setActKidFriendly(e.target.checked)} className="w-4 h-4 accent-navy" />
                <span className="text-sm font-display text-ink">Kid-friendly</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={resetActivityForm} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => editingActivity ? updateActivityMutation.mutate() : createActivityMutation.mutate(showActivityForm)}
                disabled={!actDesc.trim()}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {editingActivity ? 'Save Changes' : 'Add Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
