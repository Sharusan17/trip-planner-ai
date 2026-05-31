import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { depositsApi } from '@/api/deposits';
import type { CreateDepositInput } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';
import { toDateInput } from '@/utils/date';
import { getCurrencySymbol, ALL_CURRENCIES } from '@/utils/currency';
const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

const CATEGORY_OPTIONS = [
  { value: '',              label: 'None',          emoji: '—'  },
  { value: 'accommodation', label: 'Accommodation',  emoji: '🏨' },
  { value: 'transport',     label: 'Transport',      emoji: '✈️' },
  { value: 'activity',      label: 'Activity',       emoji: '🎟️' },
  { value: 'other',         label: 'Other',          emoji: '📦' },
];

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

interface FormData {
  description: string;
  amount: string;
  currency: string;
  due_date: string;
  linked_type: string;
  notes: string;
}

export default function DepositFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip, activeTraveller } = useTrip();
  const qc = useQueryClient();

  const destCurrency = currentTrip?.dest_currency ?? 'EUR';
  const homeCurrency = currentTrip?.home_currency ?? 'GBP';

  const [form, setForm] = useState<FormData>({
    description: '', amount: '', currency: destCurrency,
    due_date: '', linked_type: '', notes: '',
  });

  const { data: deposits = [] } = useQuery({
    queryKey: ['deposits', currentTrip?.id],
    queryFn: () => depositsApi.list(currentTrip!.id),
    enabled: !!currentTrip && isEdit,
  });

  useEffect(() => {
    if (!isEdit || !id || deposits.length === 0) return;
    const dep = deposits.find((d) => d.id === id);
    if (!dep) return;
    setForm({
      description: dep.description,
      amount: String(dep.amount),
      currency: dep.currency,
      due_date: toDateInput(dep.due_date),
      linked_type: dep.linked_type ?? '',
      notes: dep.notes ?? '',
    });
  }, [isEdit, id, deposits]);

  const createMutation = useMutation({
    mutationFn: (data: CreateDepositInput) => depositsApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposits'] }); navigate('/expenses?tab=deposits'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: did, data }: { id: string; data: Partial<CreateDepositInput> }) =>
      depositsApi.update(did, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposits'] }); navigate('/expenses?tab=deposits'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount || parseFloat(form.amount) <= 0) return;
    const data: CreateDepositInput = {
      description: form.description,
      amount: parseFloat(form.amount),
      currency: form.currency,
      due_date: form.due_date || undefined,
      linked_type: (form.linked_type as CreateDepositInput['linked_type']) || undefined,
      notes: form.notes || undefined,
      created_by: activeTraveller?.id,
    };
    if (isEdit && id) updateMutation.mutate({ id, data });
    else createMutation.mutate(data);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const sym = getCurrencySymbol(form.currency);

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses?tab=deposits')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {isEdit ? 'Edit Deposit' : 'Add Deposit'}
          </h1>
          <p className="text-sm text-ink-faint">Track a refundable payment or reservation hold</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description + Category */}
        <div className="vintage-card p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Description *</label>
            <input
              className="vintage-input w-full"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Hotel security deposit"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, linked_type: opt.value })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    form.linked_type === opt.value
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white border-parchment-dark text-ink hover:bg-parchment/60'
                  }`}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Amount + Currency */}
        <div className="vintage-card p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Amount *</label>
            <div className="flex items-center border border-parchment-dark rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-navy/30">
              <span className="px-3 text-base font-medium text-ink-faint bg-parchment/60 border-r border-parchment-dark self-stretch flex items-center select-none">
                {sym}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                className="flex-1 px-3 py-3 text-xl font-display outline-none bg-white"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setForm({ ...form, amount: String(q) })}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    form.amount === String(q)
                      ? 'bg-navy text-white'
                      : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
                  }`}
                >
                  {sym}{q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Currency</label>
            <div className="flex flex-wrap gap-1.5">
              {[destCurrency, ...(homeCurrency !== destCurrency ? [homeCurrency] : []), 'USD', 'EUR', 'GBP']
                .filter((c, i, arr) => arr.indexOf(c) === i)
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, currency: c })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      form.currency === c
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white border-parchment-dark text-ink hover:bg-parchment/60'
                    }`}
                  >
                    {getCurrencySymbol(c)} {c}
                  </button>
                ))}
              <select
                className="px-2 py-1.5 rounded-lg text-xs border border-parchment-dark text-ink bg-white"
                value={[destCurrency, homeCurrency, 'USD', 'EUR', 'GBP'].includes(form.currency) ? '' : form.currency}
                onChange={(e) => { if (e.target.value) setForm({ ...form, currency: e.target.value }); }}
              >
                <option value="">More…</option>
                {ALL_CURRENCIES.filter((c) => ![destCurrency, homeCurrency, 'USD', 'EUR', 'GBP'].includes(c)).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Due Date + Notes */}
        <div className="vintage-card p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Due Date</label>
            <input
              type="date"
              className="vintage-input w-full"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Notes (optional)</label>
            <input
              className="vintage-input w-full"
              placeholder="e.g. Refundable on checkout"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate('/expenses?tab=deposits')}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.description || !form.amount || parseFloat(form.amount) <= 0 || isPending}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Deposit'}
          </button>
        </div>
      </form>
    </div>
  );
}
