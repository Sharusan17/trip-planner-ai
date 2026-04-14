import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { depositsApi } from '@/api/deposits';
import type { CreateDepositInput } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';

const ALL_CURRENCIES = [
  'AED','AUD','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP',
  'HKD','HUF','INR','JPY','KRW','MXN','NOK','NZD','PLN','SAR',
  'SEK','SGD','THB','TRY','USD','ZAR',
];

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };
const LINKED_TYPES = ['accommodation', 'transport', 'activity', 'other'] as const;

interface FormData {
  description: string; amount: string; currency: string;
  due_date: string; linked_type: string; notes: string;
}

const emptyForm: FormData = { description: '', amount: '', currency: 'EUR', due_date: '', linked_type: '', notes: '' };

export default function DepositFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const destCurrency = currentTrip?.dest_currency ?? 'EUR';
  const homeCurrency = currentTrip?.home_currency ?? 'GBP';

  const [form, setForm] = useState<FormData>({ ...emptyForm, currency: destCurrency });

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
      description: dep.description, amount: String(dep.amount), currency: dep.currency,
      due_date: dep.due_date ?? '', linked_type: dep.linked_type ?? '', notes: dep.notes ?? '',
    });
  }, [isEdit, id, deposits]);

  const createMutation = useMutation({
    mutationFn: (data: CreateDepositInput) => depositsApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposits'] }); navigate('/expenses'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: did, data }: { id: string; data: Partial<CreateDepositInput> }) =>
      depositsApi.update(did, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposits'] }); navigate('/expenses'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateDepositInput = {
      description: form.description, amount: parseFloat(form.amount),
      currency: form.currency, due_date: form.due_date || undefined,
      linked_type: (form.linked_type as CreateDepositInput['linked_type']) || undefined,
      notes: form.notes || undefined,
    };
    if (isEdit && id) updateMutation.mutate({ id, data });
    else createMutation.mutate(data);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/expenses')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEdit ? 'Edit Deposit' : 'Add Deposit'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Description *</label>
          <input className="vintage-input w-full" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Hotel security deposit" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Amount *</label>
            <input type="number" step="0.01" min="0" className="vintage-input w-full" required
              value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Currency</label>
            <select className="vintage-input w-full" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value={destCurrency}>{destCurrency} {CURRENCY_SYMBOLS[destCurrency] ?? ''}</option>
              {homeCurrency !== destCurrency && (
                <option value={homeCurrency}>{homeCurrency} {CURRENCY_SYMBOLS[homeCurrency] ?? ''}</option>
              )}
              <option disabled>──────────</option>
              {ALL_CURRENCIES.filter((c) => c !== destCurrency && c !== homeCurrency).map((c) => (
                <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c] ?? ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Due Date</label>
          <input type="date" className="vintage-input w-full" value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Category</label>
          <select className="vintage-input w-full" value={form.linked_type}
            onChange={(e) => setForm({ ...form, linked_type: e.target.value })}>
            <option value="">None</option>
            {LINKED_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Notes</label>
          <textarea className="vintage-input w-full" rows={3} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/expenses')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Deposit'}
          </button>
        </div>
      </form>
    </div>
  );
}
