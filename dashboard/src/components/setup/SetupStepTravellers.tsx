import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { travellersApi } from '@/api/travellers';
import type { CreateTravellerInput, TravellerType } from '@trip-planner-ai/shared';

const AVATAR_COLOURS = [
  '#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A',
  '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574',
];

interface Draft {
  name: string;
  type: TravellerType;
}

interface Props { tripId: string }

export default function SetupStepTravellers({ tripId }: Props) {
  const qc = useQueryClient();
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId),
  });

  const [draft, setDraft] = useState<Draft>({ name: '', type: 'adult' });
  const [rowError, setRowError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateTravellerInput) => travellersApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travellers', tripId] });
      setDraft({ name: '', type: 'adult' });
      setRowError(null);
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add traveller'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => travellersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['travellers', tripId] }),
  });

  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name) return;
    const costWeight = draft.type === 'infant' ? 0 : draft.type === 'child' ? 0.5 : 1.0;
    // Pick the next unused colour; fall back to cycling
    const usedColours = new Set(travellers.map((t) => t.avatar_colour));
    const colour = AVATAR_COLOURS.find((c) => !usedColours.has(c))
      ?? AVATAR_COLOURS[travellers.length % AVATAR_COLOURS.length];
    createMutation.mutate({
      name,
      type: draft.type,
      role: 'member',
      avatar_colour: colour,
      cost_split_weight: costWeight,
    });
  };

  return (
    <div className="space-y-3">
      {/* Existing travellers */}
      {travellers.length > 0 && (
        <div className="space-y-2">
          {travellers.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                style={{ backgroundColor: t.avatar_colour }}
              >
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">{t.name}</div>
                <div className="text-xs text-ink-faint capitalize">
                  {t.type} &middot; {t.role}
                </div>
              </div>
              {t.role !== 'organiser' && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove ${t.name}?`)) deleteMutation.mutate(t.id);
                  }}
                  className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
                  aria-label={`Remove ${t.name}`}
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Draft row */}
      <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30">
        <input
          className="vintage-input flex-1"
          placeholder="Name (e.g. Alex)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && saveDraft()}
        />
        <select
          className="vintage-input sm:w-36"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as TravellerType })}
        >
          <option value="adult">Adult</option>
          <option value="child">Child</option>
          <option value="infant">Infant</option>
        </select>
        <button
          type="button"
          onClick={saveDraft}
          disabled={!draft.name.trim() || createMutation.isPending}
          className="btn-primary flex items-center justify-center gap-1.5 sm:w-28 disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2.5} /> Add
        </button>
      </div>

      {rowError && (
        <p className="text-xs text-terracotta">{rowError}</p>
      )}

      <p className="text-xs text-ink-faint">
        {travellers.length} {travellers.length === 1 ? 'person' : 'people'} added
      </p>
    </div>
  );
}
