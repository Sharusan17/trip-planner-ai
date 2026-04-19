import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { itineraryApi } from '@/api/itinerary';
import type { CreateActivityInput, ActivityType } from '@trip-planner-ai/shared';
import { ACTIVITY_ICONS } from '@trip-planner-ai/shared';
import SetupTip from './SetupTip';

const TIPS: Record<string, string> = {
  beach:     'Add snorkelling, sunset dinners, water sports, and beach club bookings.',
  city:      'Walking tours, food markets, galleries, and day trips work great here.',
  adventure: 'List each activity with the operator name — handy in an emergency.',
  family:    "Mark activities as kid-friendly — they'll be highlighted on the itinerary.",
  ski:       'Add ski school sessions, equipment rental pick-up, and après-ski evenings.',
  road_trip: 'Add key stops and overnight spots as activities tied to each driving day.',
  cruise:    "Add port excursions per day — they're usually the highlight of any cruise.",
};

const ACTIVITY_TYPE_OPTIONS: ActivityType[] = [
  'sightseeing', 'food', 'beach', 'shopping', 'entertainment',
  'hotel', 'flight', 'transport', 'custom',
];

interface Draft {
  day_id: string;
  time: string;
  type: ActivityType;
  description: string;
  location_tag: string;
  kid_friendly: boolean;
}

interface Props {
  tripId: string;
  startDate: string;
  endDate: string;
  holidayType: string;
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return out;
  const cur = new Date(s);
  while (cur <= e) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function SetupStepActivities({ tripId, startDate, endDate, holidayType }: Props) {
  const qc = useQueryClient();
  const { data: days = [], isLoading } = useQuery({
    queryKey: ['days', tripId],
    queryFn: () => itineraryApi.getDays(tripId),
  });

  // Auto-create days if none exist yet
  const hasBootstrappedRef = useRef(false);
  useEffect(() => {
    if (isLoading || hasBootstrappedRef.current) return;
    if (days.length > 0) { hasBootstrappedRef.current = true; return; }
    const targetDates = datesBetween(startDate, endDate);
    if (targetDates.length === 0) return;
    hasBootstrappedRef.current = true;
    (async () => {
      for (let i = 0; i < targetDates.length; i++) {
        try { await itineraryApi.createDay(tripId, { date: targetDates[i], day_number: i + 1 }); }
        catch { /* ignore duplicates */ }
      }
      qc.invalidateQueries({ queryKey: ['days', tripId] });
    })();
  }, [isLoading, days.length, startDate, endDate, tripId, qc]);

  const showKidFriendly = holidayType === 'family';

  const [draft, setDraft] = useState<Draft>({
    day_id: '',
    time: '',
    type: 'sightseeing',
    description: '',
    location_tag: '',
    kid_friendly: false,
  });
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.day_id && days.length > 0) {
      setDraft((d) => ({ ...d, day_id: days[0].id }));
    }
  }, [days, draft.day_id]);

  const createMutation = useMutation({
    mutationFn: ({ dayId, data }: { dayId: string; data: CreateActivityInput }) =>
      itineraryApi.createActivity(dayId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['days', tripId] });
      setDraft((d) => ({ ...d, time: '', description: '', location_tag: '', kid_friendly: false }));
      setRowError(null);
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add activity'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => itineraryApi.deleteActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['days', tripId] }),
  });

  const saveDraft = () => {
    if (!draft.day_id || !draft.description.trim()) return;
    createMutation.mutate({
      dayId: draft.day_id,
      data: {
        time: draft.time || undefined,
        type: draft.type,
        description: draft.description.trim(),
        location_tag: draft.location_tag.trim() || undefined,
        kid_friendly: draft.kid_friendly || undefined,
      },
    });
  };

  const allActivities = days.flatMap((d) =>
    (d.activities ?? []).map((a) => ({ ...a, dayNumber: d.day_number, dayDate: d.date })),
  );

  const fmtDayLabel = (date: string, num: number) => {
    try {
      const d = new Date(date);
      return `Day ${num} · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
    } catch { return `Day ${num}`; }
  };

  return (
    <div className="space-y-3">
      <SetupTip tip={TIPS[holidayType]} />

      {isLoading && <p className="text-xs text-ink-faint">Loading days&hellip;</p>}

      {/* Existing activities */}
      {allActivities.length > 0 && (
        <div className="space-y-2">
          {allActivities.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white"
            >
              <span className="text-xl flex-shrink-0">{ACTIVITY_ICONS[a.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">{a.description}</div>
                <div className="text-xs text-ink-faint">
                  Day {a.dayNumber}{a.time ? ` · ${a.time}` : ''}
                  {a.location_tag ? ` · 📍 ${a.location_tag}` : ''}
                  {a.kid_friendly ? ' · 👶 Kid-friendly' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (confirm('Remove this activity?')) deleteMutation.mutate(a.id); }}
                className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
                aria-label="Remove activity"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Draft form */}
      {days.length > 0 ? (
        <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-2">
          {/* Day + time */}
          <div className="grid grid-cols-3 gap-2">
            <select
              className="vintage-input col-span-2"
              value={draft.day_id}
              onChange={(e) => setDraft({ ...draft, day_id: e.target.value })}
            >
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {fmtDayLabel(d.date, d.day_number)}
                </option>
              ))}
            </select>
            <input
              type="time"
              className="vintage-input"
              placeholder="Time"
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </div>

          {/* Description + type on one line */}
          <div className="flex gap-2">
            <input
              className="vintage-input flex-1 min-w-0"
              placeholder="Description (e.g. Snorkelling trip)"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && saveDraft()}
            />
            <select
              className="vintage-input w-28 text-sm flex-shrink-0"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as ActivityType })}
            >
              {ACTIVITY_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_ICONS[t]} {t === 'sightseeing' ? 'Sights' : t === 'entertainment' ? 'Fun' : t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <input
            className="vintage-input w-full"
            placeholder="Location (optional — e.g. Praia da Rocha)"
            value={draft.location_tag}
            onChange={(e) => setDraft({ ...draft, location_tag: e.target.value })}
          />

          {/* Kid-friendly toggle — only for family trips */}
          {showKidFriendly && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-navy w-4 h-4"
                checked={draft.kid_friendly}
                onChange={(e) => setDraft({ ...draft, kid_friendly: e.target.checked })}
              />
              <span className="text-sm text-ink">Kid-friendly 👶</span>
            </label>
          )}

          <button
            type="button"
            onClick={saveDraft}
            disabled={!draft.description.trim() || createMutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2.5} /> Add activity
          </button>
        </div>
      ) : (
        !isLoading && (
          <p className="text-xs text-ink-faint p-3 rounded-xl border border-dashed border-parchment-dark">
            Setting up day slots&hellip; hold on a moment.
          </p>
        )
      )}

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}
      <p className="text-xs text-ink-faint">
        {allActivities.length} {allActivities.length === 1 ? 'activity' : 'activities'} planned
        &middot; {days.length} {days.length === 1 ? 'day' : 'days'} in itinerary
      </p>
    </div>
  );
}
