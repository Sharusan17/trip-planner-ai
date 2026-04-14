import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ACTIVITY_ICONS, type ActivityType } from '@trip-planner-ai/shared';
import { ArrowLeft, MapPin, Baby } from 'lucide-react';

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
  const [actKidFriendly, setActKidFriendly] = useState(true);

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
        setActLat(activity.latitude?.toString() || '');
        setActLng(activity.longitude?.toString() || '');
        setActKidFriendly(activity.kid_friendly);
        break;
      }
    }
  }, [isEdit, id, days]);

  const targetDayId = isEdit ? (days.find((d) => d.activities.some((a) => a.id === id))?.id ?? '') : (dayId ?? '');

  const createMutation = useMutation({
    mutationFn: () => itineraryApi.createActivity(targetDayId, {
      time: actTime || undefined,
      type: actType,
      description: actDesc,
      location_tag: actLocation || undefined,
      latitude: actLat ? parseFloat(actLat) : undefined,
      longitude: actLng ? parseFloat(actLng) : undefined,
      kid_friendly: actKidFriendly,
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
      kid_friendly: actKidFriendly,
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
                      ? `${colour.bg} border-[${colour.border}] ${colour.text}`
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

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Description *</label>
          <input className="vintage-input w-full" required value={actDesc}
            onChange={(e) => setActDesc(e.target.value)}
            placeholder="e.g. Sunrise hike to the viewpoint" />
        </div>

        {/* Time */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Time (optional)</label>
          <input type="time" className="vintage-input w-full" value={actTime}
            onChange={(e) => setActTime(e.target.value)} />
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={12} />Location (optional)
          </label>
          <input className="vintage-input w-full" value={actLocation}
            onChange={(e) => setActLocation(e.target.value)}
            placeholder="e.g. Pena Palace, Sintra" />
        </div>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Latitude</label>
            <input type="number" step="any" className="vintage-input w-full" value={actLat}
              onChange={(e) => setActLat(e.target.value)} placeholder="38.7877" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Longitude</label>
            <input type="number" step="any" className="vintage-input w-full" value={actLng}
              onChange={(e) => setActLng(e.target.value)} placeholder="-9.3906" />
          </div>
        </div>

        {/* Kid friendly toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-navy rounded" checked={actKidFriendly}
            onChange={(e) => setActKidFriendly(e.target.checked)} />
          <span className="flex items-center gap-1.5 text-sm font-body text-ink">
            <Baby size={15} className="text-ink-faint" />Kid friendly
          </span>
        </label>

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
