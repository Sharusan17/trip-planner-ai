import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { checklistApi } from '@/api/checklist';
import { parseLocalDate } from '@/utils/date';
import { CheckSquare, Square, Trash2, Globe, Plus, Luggage } from 'lucide-react';
import type { ChecklistItem } from '@trip-planner-ai/shared';

// ── date helpers ───────────────────────────────────────────────────────────────
function daysFromToday(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(iso).getTime() - today.getTime()) / 86_400_000);
}

// ── single checklist row ───────────────────────────────────────────────────────
function CheckItem({
  item,
  canDelete,
  canShare,
  onToggle,
  onDelete,
  onShare,
}: {
  item: ChecklistItem;
  canDelete: boolean;
  canShare: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 py-2 px-1 rounded-lg transition-colors ${item.checked ? 'opacity-60' : ''}`}>
      <button
        onClick={onToggle}
        className="flex-shrink-0 text-navy hover:text-navy-dark transition-colors"
        aria-label={item.checked ? 'Uncheck' : 'Check'}
      >
        {item.checked
          ? <CheckSquare size={18} className="text-navy" />
          : <Square size={18} className="text-ink-faint" />}
      </button>
      <span className={`flex-1 text-sm ${item.checked ? 'line-through text-ink-faint' : 'text-ink'}`}>
        {item.label}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {canShare && (
          <button
            onClick={onShare}
            title="Share with everyone"
            className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-navy transition-colors"
          >
            <Globe size={13} />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            title="Remove item"
            className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-terracotta transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── inline add-item input ──────────────────────────────────────────────────────
function AddItemInput({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (trimmed) { onAdd(trimmed); setValue(''); }
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <Plus size={14} className="text-ink-faint flex-shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        onBlur={submit}
        placeholder="Add item…"
        className="flex-1 text-sm bg-transparent outline-none text-ink placeholder:text-ink-faint border-b border-dashed border-parchment-dark focus:border-navy pb-0.5 transition-colors"
      />
    </div>
  );
}

// ── main widget ────────────────────────────────────────────────────────────────
export default function ChecklistWidget() {
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const qc = useQueryClient();

  if (!currentTrip || !activeTraveller) return null;

  const daysToStart = daysFromToday(currentTrip.start_date);
  const daysToEnd   = daysFromToday(currentTrip.end_date);

  // Only show in the 2-day window before/on departure, or on the last day
  const showWidget = (daysToStart >= 0 && daysToStart <= 2) || daysToEnd === 0;
  if (!showWidget) return null;

  const phase: 'departure' | 'arrival' | 'before' =
    daysToStart === 0 ? 'departure' :
    daysToEnd   === 0 ? 'arrival'   : 'before';

  const tripId      = currentTrip.id;
  const travellerId = activeTraveller.id;

  const { data: items = [] } = useQuery({
    queryKey: ['checklist', tripId, travellerId],
    queryFn: () => checklistApi.getItems(tripId, travellerId),
    enabled: !!tripId && !!travellerId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['checklist', tripId, travellerId] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      checklistApi.toggleCheck(id, travellerId, checked),
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: ['checklist', tripId, travellerId] });
      const prev = qc.getQueryData<ChecklistItem[]>(['checklist', tripId, travellerId]);
      qc.setQueryData<ChecklistItem[]>(['checklist', tripId, travellerId], (old = []) =>
        old.map((item) => item.id === id ? { ...item, checked } : item)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['checklist', tripId, travellerId], ctx.prev);
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: { label: string; is_shared: boolean }) =>
      checklistApi.addItem(tripId, { ...data, created_by: travellerId }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => checklistApi.deleteItem(id),
    onSuccess: invalidate,
  });

  const shareMutation = useMutation({
    mutationFn: (id: string) => checklistApi.updateItem(id, { is_shared: true }),
    onSuccess: invalidate,
  });

  const sharedItems  = items.filter((i) => i.is_shared);
  const privateItems = items.filter((i) => !i.is_shared);
  const sharedChecked = sharedItems.filter((i) => i.checked).length;

  // ── phase banner config ──────────────────────────────────────────────────────
  const bannerConfig = {
    departure: {
      bg: 'bg-navy/5 border-navy/20',
      icon: '✈️',
      title: 'Departing today!',
      sub: 'Have you packed everything? Check off each item before you leave.',
    },
    arrival: {
      bg: 'bg-emerald-50 border-emerald-200',
      icon: '🏠',
      title: 'Heading home today!',
      sub: 'Make sure you have everything before you check out.',
    },
    before: {
      bg: 'bg-amber-50 border-amber-200',
      icon: '🧳',
      title: daysToStart === 1 ? 'Departing tomorrow!' : `${daysToStart} days until departure`,
      sub: 'Get your checklist ready.',
    },
  }[phase];

  return (
    <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
      {/* Phase banner */}
      <div className={`flex items-start gap-3 px-4 py-3 border-b ${bannerConfig.bg}`}>
        <span className="text-xl flex-shrink-0 mt-0.5">{bannerConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-ink text-sm">{bannerConfig.title}</p>
          <p className="text-xs text-ink-faint mt-0.5">{bannerConfig.sub}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-semibold text-ink">{sharedChecked}/{sharedItems.length}</p>
          <p className="text-[10px] text-ink-faint">checked</p>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 space-y-4">
        {/* ── Shared list ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Luggage size={13} className="text-ink-faint" />
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">Shared list</p>
          </div>
          <div className="divide-y divide-parchment-dark/60">
            {sharedItems.map((item) => (
              <CheckItem
                key={item.id}
                item={item}
                canDelete={isOrganiser}
                canShare={false}
                onToggle={() => toggleMutation.mutate({ id: item.id, checked: !item.checked })}
                onDelete={() => deleteMutation.mutate(item.id)}
                onShare={() => {}}
              />
            ))}
          </div>
          {isOrganiser && (
            <AddItemInput onAdd={(label) => addMutation.mutate({ label, is_shared: true })} />
          )}
        </div>

        {/* ── Private list ────────────────────────────────────────────────────── */}
        <div className="pt-1 border-t border-parchment-dark">
          <div className="flex items-center gap-2 mb-1">
            <Globe size={13} className="text-ink-faint" />
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">My list</p>
          </div>
          {privateItems.length === 0 && (
            <p className="text-xs text-ink-faint px-1 py-1">Nothing yet — add something below.</p>
          )}
          <div className="divide-y divide-parchment-dark/60">
            {privateItems.map((item) => (
              <CheckItem
                key={item.id}
                item={item}
                canDelete={true}
                canShare={true}
                onToggle={() => toggleMutation.mutate({ id: item.id, checked: !item.checked })}
                onDelete={() => deleteMutation.mutate(item.id)}
                onShare={() => shareMutation.mutate(item.id)}
              />
            ))}
          </div>
          <AddItemInput onAdd={(label) => addMutation.mutate({ label, is_shared: false })} />
        </div>
      </div>
    </div>
  );
}
