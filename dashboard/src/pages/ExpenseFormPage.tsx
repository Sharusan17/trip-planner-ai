import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expensesApi } from '@/api/expenses';
import type { ReceiptScanResult } from '@/api/expenses';
import { travellersApi } from '@/api/travellers';
import type { ExpenseCategory, SplitMode, CreateExpenseInput, ExpenseLineItem } from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft, ScanLine, Paperclip, CheckCircle2, Loader2 } from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = [
  'accommodation', 'food', 'transport', 'activities', 'shopping', 'other',
];

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal',    label: 'Equal'    },
  { key: 'custom',   label: 'Custom'   },
  { key: 'itemised', label: 'Itemised' },
];

const ALL_CURRENCIES = [
  'AED','AUD','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP',
  'HKD','HUF','INR','JPY','KRW','MXN','NOK','NZD','PLN','SAR',
  'SEK','SGD','THB','TRY','USD','ZAR',
];

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

interface FormData {
  description: string; amount: string; currency: string;
  category: ExpenseCategory; expense_date: string; paid_by: string;
  split_mode: SplitMode; traveller_ids: string[];
  custom_splits: Record<string, string>; notes: string;
}

export default function ExpenseFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const qc = useQueryClient();

  const destCurrency = currentTrip?.dest_currency ?? 'EUR';
  const homeCurrency = currentTrip?.home_currency ?? 'GBP';

  const [form, setForm] = useState<FormData>({
    description: '', amount: '', currency: destCurrency,
    category: 'other',
    expense_date: new Date().toISOString().split('T')[0],
    paid_by: activeTraveller?.id ?? '', split_mode: 'equal',
    traveller_ids: [], custom_splits: {}, notes: '',
  });
  const [lineItems, setLineItems] = useState<Array<{ description: string; amount: string; traveller_ids: string[] }>>([
    { description: '', amount: '', traveller_ids: [] },
  ]);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', currentTrip?.id],
    queryFn: () => expensesApi.list(currentTrip!.id),
    enabled: !!currentTrip && isEdit,
  });

  useEffect(() => {
    if (!isEdit || !id || expenses.length === 0) return;
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;
    const cs: Record<string, string> = {};
    for (const s of exp.splits) cs[s.traveller_id] = String(s.amount);
    setForm({
      description: exp.description, amount: String(exp.amount), currency: exp.currency,
      category: exp.category, expense_date: exp.expense_date, paid_by: exp.paid_by,
      split_mode: exp.split_mode, traveller_ids: exp.splits.map((s) => s.traveller_id),
      custom_splits: cs, notes: exp.notes ?? '',
    });
    if (exp.split_mode === 'itemised' && exp.line_items?.length) {
      setLineItems(exp.line_items.map((li) => ({
        description: li.description, amount: String(li.amount), traveller_ids: li.traveller_ids,
      })));
    }
  }, [isEdit, id, expenses]);

  const createMutation = useMutation({
    mutationFn: async (data: CreateExpenseInput) => {
      const expense = await expensesApi.create(currentTrip!.id, data);
      if (receiptFile) await expensesApi.uploadReceipt(expense.id, receiptFile).catch(() => {});
      return expense;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); navigate('/expenses'); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id: eid, data }: { id: string; data: Partial<CreateExpenseInput> }) => {
      const expense = await expensesApi.update(eid, data);
      if (receiptFile) await expensesApi.uploadReceipt(eid, receiptFile).catch(() => {});
      return expense;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); navigate('/expenses'); },
  });

  // ── Receipt scan ──────────────────────────────────────────────────────────
  async function handleScanReceipt() {
    if (!receiptFile) return;
    setScanState('scanning');
    try {
      const result = await expensesApi.scanReceipt(receiptFile);
      setScanResult(result);

      // Normalise date: Tabscanner may return DD/MM/YYYY — convert to YYYY-MM-DD
      let parsedDate = result.date;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(parsedDate)) {
        const [d, m, y] = parsedDate.split('/');
        parsedDate = `${y}-${m}-${d}`;
      }

      setForm((prev) => ({
        ...prev,
        description:  prev.description || result.merchant || prev.description,
        amount:       result.total > 0 ? String(result.total) : prev.amount,
        currency:     result.currency || prev.currency,
        expense_date: parsedDate || prev.expense_date,
        split_mode:   result.lineItems.length > 0 ? 'itemised' : prev.split_mode,
      }));

      if (result.lineItems.length > 0) {
        setLineItems(result.lineItems.map((li) => ({
          description:  li.description,
          amount:       String(li.amount),
          traveller_ids: [],
        })));
      }

      setScanState('done');
    } catch {
      setScanState('error');
    }
  }

  function clearReceipt() {
    setReceiptFile(null);
    setReceiptPreview(null);
    setScanState('idle');
    setScanResult(null);
  }

  function computeItemisedSplits(): Record<string, number> {
    const splits: Record<string, number> = {};
    for (const item of lineItems) {
      const amt = parseFloat(item.amount) || 0;
      if (amt <= 0 || item.traveller_ids.length === 0) continue;
      const share = amt / item.traveller_ids.length;
      for (const tid of item.traveller_ids) splits[tid] = (splits[tid] ?? 0) + share;
    }
    return splits;
  }

  function getName(id: string) {
    return travellers.find((t) => t.id === id)?.name ?? id;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.split_mode === 'itemised') {
      const computedSplits = computeItemisedSplits();
      const validLineItems: ExpenseLineItem[] = lineItems
        .filter((li) => li.description.trim() && parseFloat(li.amount) > 0)
        .map((li) => ({ description: li.description, amount: parseFloat(li.amount), traveller_ids: li.traveller_ids }));
      const data: CreateExpenseInput = {
        description: form.description, amount: parseFloat(form.amount),
        currency: form.currency, category: form.category,
        expense_date: form.expense_date, paid_by: form.paid_by,
        split_mode: 'itemised',
        traveller_ids: Object.keys(computedSplits).length > 0 ? Object.keys(computedSplits) : travellers.map((t) => t.id),
        custom_splits: computedSplits,
        line_items: validLineItems,
        notes: form.notes || undefined,
      };
      if (isEdit && id) updateMutation.mutate({ id, data });
      else createMutation.mutate(data);
      return;
    }

    if (form.split_mode === 'custom') {
      const target = parseFloat(form.amount) || 0;
      const cs: Record<string, number> = {};
      for (const [tid, v] of Object.entries(form.custom_splits)) {
        const n = parseFloat(v) || 0;
        if (n > 0) cs[tid] = n;
      }
      const total = Object.values(cs).reduce((s, v) => s + v, 0);
      if (target > 0 && Math.abs(total - target) >= 0.01) {
        alert(`Custom splits must add up to ${fmt(target, form.currency)}. Currently: ${fmt(total, form.currency)}.`);
        return;
      }
      const data: CreateExpenseInput = {
        description: form.description, amount: target,
        currency: form.currency, category: form.category,
        expense_date: form.expense_date, paid_by: form.paid_by,
        split_mode: 'custom',
        traveller_ids: Object.keys(cs).length > 0 ? Object.keys(cs) : travellers.map((t) => t.id),
        custom_splits: cs,
        notes: form.notes || undefined,
      };
      if (isEdit && id) updateMutation.mutate({ id, data });
      else createMutation.mutate(data);
      return;
    }

    const data: CreateExpenseInput = {
      description: form.description, amount: parseFloat(form.amount),
      currency: form.currency, category: form.category,
      expense_date: form.expense_date, paid_by: form.paid_by,
      split_mode: form.split_mode,
      traveller_ids: form.traveller_ids.length > 0 ? form.traveller_ids : travellers.map((t) => t.id),
      notes: form.notes || undefined,
    };
    if (isEdit && id) updateMutation.mutate({ id, data });
    else createMutation.mutate(data);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const customTarget = parseFloat(form.amount) || 0;
  const customTotal = travellers.reduce((s, t) => s + (parseFloat(form.custom_splits[t.id] ?? '') || 0), 0);
  const customDiff = customTarget > 0 ? customTotal - customTarget : 0;
  const customValid = customTarget > 0 && Math.abs(customDiff) < 0.01;
  const customOver = customDiff > 0.01;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/expenses')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEdit ? 'Edit Expense' : 'Log Expense'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        {/* Receipt scan — shown first so auto-fill populates the fields below */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Receipt (optional)</label>
          <input ref={receiptInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setReceiptFile(f);
              setReceiptPreview(URL.createObjectURL(f));
              setScanState('idle');
              setScanResult(null);
            }} />

          {receiptFile ? (
            <div className="space-y-2.5">
              {/* Preview */}
              <div className="relative rounded-xl overflow-hidden border border-parchment-dark">
                <img src={receiptPreview!} alt="Receipt" className="w-full max-h-52 object-cover" />
                <button type="button" onClick={clearReceipt}
                  className="absolute top-2 right-2 w-6 h-6 bg-ink/60 text-white rounded-full flex items-center justify-center text-sm hover:bg-ink leading-none">×</button>
              </div>

              {/* Scan CTA / status */}
              {scanState === 'idle' && (
                <button type="button" onClick={handleScanReceipt}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-dark transition-colors">
                  <ScanLine size={15} strokeWidth={2} />
                  Scan &amp; Auto-fill
                </button>
              )}

              {scanState === 'scanning' && (
                <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-parchment/60 border border-parchment-dark text-sm text-ink-faint">
                  <Loader2 size={15} className="animate-spin text-navy" />
                  Scanning receipt…
                </div>
              )}

              {scanState === 'done' && scanResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                      <CheckCircle2 size={14} /> Scanned
                    </span>
                    <button type="button" onClick={() => setScanState('idle')}
                      className="text-xs text-emerald-600 hover:underline">Rescan</button>
                  </div>
                  <div className="text-xs text-emerald-700 space-y-0.5">
                    {scanResult.merchant   && <div>Merchant · <span className="font-medium">{scanResult.merchant}</span></div>}
                    {scanResult.total > 0  && <div>Total · <span className="font-medium">{scanResult.currency} {scanResult.total.toFixed(2)}</span></div>}
                    {scanResult.hasVat     && <div>VAT distributed · <span className="font-medium">{scanResult.currency} {scanResult.tax.toFixed(2)}</span></div>}
                    {scanResult.lineItems.length > 0 && <div>{scanResult.lineItems.length} line items auto-filled</div>}
                  </div>
                </div>
              )}

              {scanState === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-terracotta">Could not read receipt — fill in details manually.</span>
                  <button type="button" onClick={() => setScanState('idle')} className="text-xs text-terracotta hover:underline ml-3 shrink-0">Retry</button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => receiptInputRef.current?.click()}
              className="btn-secondary text-sm w-full flex items-center justify-center gap-2 py-2.5">
              <Paperclip size={14} />
              Attach receipt
            </button>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Description *</label>
          <input className="vintage-input w-full" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Dinner at Casa Bela" />
        </div>

        {/* Amount + Currency */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Amount *</label>
            <input type="number" step="0.01" min="0" className="vintage-input w-full"
              value={form.amount} required
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
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

        {/* Category */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button key={cat} type="button"
                onClick={() => setForm({ ...form, category: cat })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  form.category === cat ? 'bg-navy text-white' : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                }`}>
                {EXPENSE_CATEGORY_ICONS[cat]} <span className="capitalize">{cat}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date + Paid by */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Date *</label>
            <input type="date" className="vintage-input w-full" value={form.expense_date} required
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Paid by *</label>
            <select className="vintage-input w-full" value={form.paid_by} required
              onChange={(e) => setForm({ ...form, paid_by: e.target.value })}>
              <option value="">Select…</option>
              {travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Split mode */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Split Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {SPLIT_MODES.map(({ key, label }) => (
              <button key={key} type="button"
                onClick={() => setForm({ ...form, split_mode: key })}
                className={`py-2 rounded-xl text-sm font-medium transition-colors border ${
                  form.split_mode === key
                    ? 'bg-[#1C1917] text-white border-[#1C1917]'
                    : 'bg-white border-parchment-dark text-ink hover:bg-parchment/60'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Split details */}
        {form.split_mode === 'itemised' ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider">Line Items</label>
              <button type="button"
                onClick={() => setLineItems((p) => [...p, { description: '', amount: '', traveller_ids: [] }])}
                className="text-xs text-navy hover:underline font-medium">+ Add item</button>
            </div>
            <div className="space-y-3">
              {lineItems.map((item, i) => (
                <div key={i} className="border border-parchment-dark rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input className="vintage-input flex-1 text-sm" placeholder="Item (e.g. Burger)"
                      value={item.description}
                      onChange={(e) => setLineItems((p) => { const n = [...p]; n[i] = { ...n[i], description: e.target.value }; return n; })} />
                    <input type="number" step="0.01" min="0" className="vintage-input w-24 text-sm text-right" placeholder="0.00"
                      value={item.amount}
                      onChange={(e) => setLineItems((p) => { const n = [...p]; n[i] = { ...n[i], amount: e.target.value }; return n; })} />
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => setLineItems((p) => p.filter((_, idx) => idx !== i))}
                        className="text-terracotta text-xl leading-none flex-shrink-0 hover:opacity-70">×</button>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint mb-1.5">Who had this?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {travellers.map((t) => (
                        <button key={t.id} type="button"
                          onClick={() => setLineItems((p) => {
                            const n = [...p];
                            const ids = n[i].traveller_ids;
                            n[i] = { ...n[i], traveller_ids: ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id] };
                            return n;
                          })}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                            item.traveller_ids.includes(t.id) ? 'bg-navy text-white' : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
                          }`}>
                          <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0"
                            style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {(() => {
              const splits = computeItemisedSplits();
              return Object.keys(splits).length > 0 ? (
                <div className="mt-3 bg-parchment/60 rounded-xl p-3">
                  <p className="text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wide">Split Preview</p>
                  <div className="space-y-1">
                    {Object.entries(splits).map(([tid, amt]) => (
                      <div key={tid} className="flex items-center justify-between text-sm">
                        <span className="text-ink">{getName(tid)}</span>
                        <span className="font-semibold text-navy">{fmt(amt, form.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        ) : form.split_mode === 'custom' ? (
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Custom Split</label>
            <div className="space-y-2">
              {travellers.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                  <span className="flex-1 text-sm text-ink">{t.name}</span>
                  <input type="number" step="0.01" min="0"
                    className="vintage-input w-28 text-sm text-right" placeholder="0.00"
                    value={form.custom_splits[t.id] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, custom_splits: { ...f.custom_splits, [t.id]: e.target.value } }))} />
                </div>
              ))}
            </div>
            {customTarget > 0 && (
              <div className={`mt-2.5 flex items-center justify-between text-xs px-1 font-medium ${customValid ? 'text-emerald-600' : 'text-terracotta'}`}>
                <span>{customValid ? '✓ Splits match total' : customOver ? `Over by ${fmt(Math.abs(customDiff), form.currency)}` : `Under by ${fmt(Math.abs(customDiff), form.currency)}`}</span>
                <span className="font-mono">{fmt(customTotal, form.currency)} / {fmt(customTarget, form.currency)}</span>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">
              Split Between {form.traveller_ids.length === 0 ? '(all)' : `(${form.traveller_ids.length})`}
            </label>
            <div className="space-y-1.5">
              {travellers.map((t) => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-navy"
                    checked={form.traveller_ids.includes(t.id)}
                    onChange={() => setForm((f) => ({
                      ...f,
                      traveller_ids: f.traveller_ids.includes(t.id)
                        ? f.traveller_ids.filter((x) => x !== t.id)
                        : [...f.traveller_ids, t.id],
                    }))} />
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                  <span className="text-sm text-ink flex-1">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Notes</label>
          <textarea className="vintage-input w-full" rows={2} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/expenses')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Expense'}
          </button>
        </div>
      </form>
    </div>
  );
}
