import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType } from '@trip-planner-ai/shared';
import { ArrowLeft, MapPin, Search, X } from 'lucide-react';

const ACTIVITY_TYPES: ActivityType[] = [
  'flight', 'transport', 'hotel', 'food', 'sightseeing', 'beach', 'shopping', 'entertainment', 'custom',
];

const ACTIVITY_COLOURS: Record<ActivityType, { bg: string; text: string; border: string }> = {
  flight:        { bg: 'bg-blue-50',    text: 'text-blue-600',   border: '#3B82F6' },
  transport:     { bg: 'bg-slate-50',   text: 'text-slate-500',  border: '#64748B' },
  hotel:         { bg: 'bg-purple-50',  text: 'text-purple-600', border: '#8B5CF6' },
  food:          { bg: 'bg-orange-50',  text: 'text-orange-500', border: '#F97316' },
  sightseeing:   { bg: 'bg-emerald-50', text: 'text-emerald-600',border: '#10B981' },
  beach:         { bg: 'bg-cyan-50',    text: 'text-cyan-600',   border: '#06B6D4' },
  shopping:      { bg: 'bg-pink-50',    text: 'text-pink-500',   border: '#EC4899' },
  entertainment: { bg: 'bg-amber-50',   text: 'text-amber-600',  border: '#F59E0B' },
  custom:        { bg: 'bg-gray-50',    text: 'text-gray-500',   border: '#94A3B8' },
};

export default function ActivityFormPage() {
  // dayId for adding; id for editing
  const { dayId, id } = useParams<{ dayId?: string; id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const [actTime, setActTime] = useState('');
  const [actType, setActType] = useState<ActivityType>('custom');
  const [actDesc, setActDesc] = useState('');
  const [actLocation, setActLocation] = useState('');
  const [actLat, setActLat] = useState('');
  const [actLng, setActLng] = useState('');

  // Location search
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState<Array<{ place_id: number; display_name: string; lat: string; lon: string }>>([]);
  const [showLocResults, setShowLocResults] = useState(false);
  const locSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip && isEdit,
  });

  // Populate form when editing
  useEffect(() => {
    if (!isEdit || !id || days.length === 0) return;
    for (const day of days) {
      const activity = day.activities.find((a) => a.id === id);
      if (activity) {
        setActTime(activity.time || '');
        setActType(activity.type);
        setActDesc(activity.description);
        setActLocation(activity.location_tag || '');
        setLocationSearch(activity.location_tag || '');
        setActLat(activity.latitude?.toString() || '');
        setActLng(activity.longitude?.toString() || '');
        break;
      }
    }
  }, [isEdit, id, days]);

  const targetDayId = isEdit ? (days.find((d) => d.activities.some((a) => a.id === id))?.id ?? '') : (dayId ?? '');

  const handleLocationSearch = (q: string) => {
    setLocationSearch(q);
    if (locSearchTimer.current) clearTimeout(locSearchTimer.current);
    if (q.length < 3) { setLocationResults([]); setShowLocResults(false); return; }
    locSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
        );
        const data = await res.json();
        setLocationResults(data);
        setShowLocResults(true);
      } catch {
        setLocationResults([]);
      }
    }, 400);
  };

  const selectLocation = (result: { display_name: string; lat: string; lon: string }) => {
    const shortName = result.display_name.split(',').slice(0, 2).join(',').trim();
    setActLocation(shortName);
    setLocationSearch(shortName);
    setActLat(parseFloat(result.lat).toFixed(6));
    setActLng(parseFloat(result.lon).toFixed(6));
    setShowLocResults(false);
  };

  const clearLocation = () => {
    setActLocation('');
    setLocationSearch('');
    setActLat('');
    setActLng('');
    setLocationResults([]);
  };

  const createMutation = useMutation({
    mutationFn: () => itineraryApi.createActivity(targetDayId, {
      time: actTime || undefined,
      type: actType,
      description: actDesc,
      location_tag: actLocation || undefined,
      latitude: actLat ? parseFloat(actLat) : undefined,
      longitude: actLng ? parseFloat(actLng) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['days'] }); navigate('/itinerary'); },
  });

  const updateMutation = useMutation({
    mutationFn: () => itineraryApi.updateActivity(id!, {
      time: actTime || undefined,
      type: actType,
      description: actDesc,
      location_tag: actLocation || undefined,
      latitude: actLat ? parseFloat(actLat) : undefined,
      longitude: actLng ? parseFloat(actLng) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['days'] }); navigate('/itinerary'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/itinerary')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEdit ? 'Edit Activity' : 'Add Activity'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        {/* Activity Name — first */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Activity Name *</label>
          <input className="vintage-input w-full" required value={actDesc}
            onChange={(e) => setActDesc(e.target.value)}
            placeholder="e.g. Sunrise hike to the viewpoint" />
        </div>

        {/* Activity type grid */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {ACTIVITY_TYPES.map((type) => {
              const colour = ACTIVITY_COLOURS[type];
              const isSelected = actType === type;
              return (
                <button key={type} type="button" onClick={() => setActType(type)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                    isSelected
                      ? `${colour.bg} ${colour.text}`
                      : 'bg-white border-parchment-dark text-ink-faint hover:bg-parchment/60'
                  }`}
                  style={isSelected ? { borderColor: colour.border } : {}}>
                  <span className="text-xl leading-none">{ACTIVITY_ICONS[type]}</span>
                  <span className="capitalize text-xs">{type}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Time */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Time (optional)</label>
          <input type="time" className="vintage-input w-full" value={actTime}
            onChange={(e) => setActTime(e.target.value)} />
        </div>

        {/* Location search */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={12} />Location (optional)
          </label>
          <div className="relative">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                className="vintage-input w-full pl-8 pr-8"
                value={locationSearch}
                onChange={(e) => handleLocationSearch(e.target.value)}
                onFocus={() => locationResults.length > 0 && setShowLocResults(true)}
                onBlur={() => setTimeout(() => setShowLocResults(false), 200)}
                placeholder="Search for a landmark or place…"
              />
              {locationSearch && (
                <button type="button" onClick={clearLocation}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
                  <X size={13} />
                </button>
              )}
            </div>
            {showLocResults && locationResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-parchment-dark rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                {locationResults.map((r) => (
                  <button key={r.place_id} type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-parchment/60 border-b border-parchment-dark last:border-0 transition-colors"
                    onMouseDown={() => selectLocation(r)}>
                    <div className="text-sm font-medium text-ink leading-snug truncate">
                      {r.display_name.split(',')[0]}
                    </div>
                    <div className="text-xs text-ink-faint mt-0.5 truncate">{r.display_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {actLat && actLng && (
            <p className="text-xs text-ink-faint mt-1.5 flex items-center gap-1">
              <MapPin size={10} className="text-navy" />
              {actLat}, {actLng}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/itinerary')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={!actDesc.trim() || isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Activity'}
          </button>
        </div>
      </form>
    </div>
  );
}
