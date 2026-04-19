import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { accommodationApi } from '@/api/accommodation';
import { travellersApi } from '@/api/travellers';
import type { CreateAccommodationInput } from '@trip-planner-ai/shared';

interface Draft {
  name: string;
  check_in_date: string;
  check_out_date: string;
  price: string;
  currency: string;
}

interface Props {
  tripId: string;
  homeCurrency: string;
}

export default function SetupStepAccommodation({ tripId, homeCurrency }: Props) {
  const qc = useQueryClient();
  const { data: stays = [] } = useQuery({
    queryKey: ['accommodation', tripId],
    queryFn: () => accommodationApi.list(tripId),
  });
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId),
  });

  const [draft, setDraft] = useState<Draft>({
    name: '',
    check_in_date: '',
    check_out_date: '',
    price: '',
    currency: homeCurrency,
  });
  const [rowError, setRowError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateAccommodationInput) => accommodationApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accommodation', tripId] });
      setDraft({ name: '', check_in_date: '', check_out_date: '', price: '', currency: homeCurrency });
      setRowError(null);
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add stay'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accommodationApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accommodation', tripId] }),
  });

  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name || !draft.check_in_date || !draft.check_out_date) return;
    const priceNum = parseFloat(draft.price);
    createMutation.mutate({
      name,
      check_in_date: draft.check_in_date,
      check_out_date: draft.check_out_date,
      price: isNaN(priceNum) ? undefined : priceNum,
      currency: draft.price ? draft.currency : undefined,
      // Default: covers all travellers
      traveller_ids: travellers.map((t) => t.id),
    });
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
    catch { return d; }
  };

  return (
    <div className="space-y-3">
      {/* Existing stays */}
      {stays.length > 0 && (
        <div className="space-y-2">
          {stays.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">{s.name}</div>
                <div className="text-xs text-ink-faint">
                  {fmtDate(s.check_in_date)} &rarr; {fmtDate(s.check_out_date)}
                  {s.price != null && ` · ${s.currency ?? ''} ${s.price.toFixed(2)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (confirm(`Remove ${s.name}?`)) deleteMutation.mutate(s.id); }}
                className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
                aria-label={`Remove ${s.name}`}
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Draft row */}
      <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-2">
        <input
          className="vintage-input w-full"
          placeholder="Hotel / stay name (e.g. Hilton Faro)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-ink-faint mb-1">Check-in</label>
            <input
              type="date"
              className="vintage-input w-full"
              value={draft.check_in_date}
              onChange={(e) => setDraft({ ...draft, check_in_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Check-out</label>
            <input
              type="date"
              className="vintage-input w-full"
              value={draft.check_out_date}
              onChange={(e) => setDraft({ ...draft, check_out_date: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Price"
            className="vintage-input col-span-2"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          />
          <select
            className="vintage-input"
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <button
          type="button"
          onClick={saveDraft}
          disabled={
            !draft.name.trim()
            || !draft.check_in_date
            || !draft.check_out_date
            || createMutation.isPending
          }
          className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2.5} /> Add stay
        </button>
      </div>

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}

      <p className="text-xs text-ink-faint">
        {stays.length} {stays.length === 1 ? 'stay' : 'stays'} added
      </p>
    </div>
  );
}
