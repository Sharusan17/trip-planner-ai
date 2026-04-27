import { useState, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expensesApi } from '@/api/expenses';
import type { ReceiptScanResult } from '@/api/expenses';
import { expenseClaimsApi } from '@/api/expenseClaims';
import type { ExpenseCategory } from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft, ScanLine, Paperclip, CheckCircle2, Loader2 } from 'lucide-react';
import { toDateInput } from '@/utils/date';

const CATEGORIES: ExpenseCategory[] = [
  'accommodation', 'food', 'transport', 'activities', 'shopping', 'other',
];

const ALL_CURRENCIES = [
  'AED', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HKD', 'HUF', 'INR', 'JPY', 'KRW', 'MXN', 'NOK', 'NZD', 'PLN', 'SAR',
  'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
];

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };

interface ClaimFormData {
  description: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  expense_date: string;
  notes: string;
}

export default function ExpenseClaimFormPage() {
  const navigate = useNavigate();
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const qc = useQueryClient();

  const destCurrency = currentTrip?.dest_currency ?? 'EUR';
  const homeCurrency = currentTrip?.home_currency ?? 'GBP';

  const [form, setForm] = useState<ClaimFormData>({
    description: '',
    amount: '',
    currency: destCurrency,
    category: 'other',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      expenseClaimsApi.create(
        currentTrip!.id,
        {
          description: form.description,
          total_amount: parseFloat(form.amount),
          currency: form.currency,
          category: form.category,
          expense_date: form.expense_date,
          notes: form.notes || undefined,
          created_by: activeTraveller!.id,
        },
        receiptFile ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claims'] });
      navigate('/expenses');
    },
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
        description: result.merchant || prev.description,
        amount: result.total > 0 ? String(result.total) : prev.amount,
        currency: result.currency || prev.currency,
        expense_date: parsedDate || prev.expense_date,
      }));

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  if (!currentTrip) return null;
  if (!isOrganiser) return <Navigate to="/expenses" replace />;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Send for Group Review</h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        {/* Receipt scan — shown first so auto-fill populates the fields below */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">
            Receipt (optional)
          </label>
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setReceiptFile(f);
              setReceiptPreview(URL.createObjectURL(f));
              setScanState('idle');
              setScanResult(null);
            }}
          />

          {receiptFile ? (
            <div className="space-y-2.5">
              {/* Preview */}
              <div className="relative rounded-xl overflow-hidden border border-parchment-dark">
                <img src={receiptPreview!} alt="Receipt" className="w-full max-h-52 object-cover" />
                <button
                  type="button"
                  onClick={clearReceipt}
                  className="absolute top-2 right-2 w-6 h-6 bg-ink/60 text-white rounded-full flex items-center justify-center text-sm hover:bg-ink leading-none"
                >
                  ×
                </button>
              </div>

              {/* Scan CTA / status */}
              {scanState === 'idle' && (
                <button
                  type="button"
                  onClick={handleScanReceipt}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-dark transition-colors"
                >
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
                    <button
                      type="button"
                      onClick={() => setScanState('idle')}
                      className="text-xs text-emerald-600 hover:underline"
                    >
                      Rescan
                    </button>
                  </div>
                  <div className="text-xs text-emerald-700 space-y-0.5">
                    {scanResult.merchant && (
                      <div>
                        Merchant · <span className="font-medium">{scanResult.merchant}</span>
                      </div>
                    )}
                    {scanResult.total > 0 && (
                      <div>
                        Total ·{' '}
                        <span className="font-medium">
                          {scanResult.currency} {scanResult.total.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {scanResult.hasVat && (
                      <div>
                        VAT distributed ·{' '}
                        <span className="font-medium">
                          {scanResult.currency} {scanResult.tax.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {scanState === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-terracotta">
                    Could not read receipt — fill in details manually.
                  </span>
                  <button
                    type="button"
                    onClick={() => setScanState('idle')}
                    className="text-xs text-terracotta hover:underline ml-3 shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => receiptInputRef.current?.click()}
              className="btn-secondary text-sm w-full flex items-center justify-center gap-2 py-2.5"
            >
              <Paperclip size={14} />
              Attach receipt
            </button>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
            Description *
          </label>
          <input
            className="vintage-input w-full"
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Dinner at Casa Bela"
          />
        </div>

        {/* Amount + Currency */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="vintage-input w-full"
              value={form.amount}
              required
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
              Currency
            </label>
            <select
              className="vintage-input w-full"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value={destCurrency}>
                {destCurrency} {CURRENCY_SYMBOLS[destCurrency] ?? ''}
              </option>
              {homeCurrency !== destCurrency && (
                <option value={homeCurrency}>
                  {homeCurrency} {CURRENCY_SYMBOLS[homeCurrency] ?? ''}
                </option>
              )}
              <option disabled>──────────</option>
              {ALL_CURRENCIES.filter((c) => c !== destCurrency && c !== homeCurrency).map((c) => (
                <option key={c} value={c}>
                  {c} {CURRENCY_SYMBOLS[c] ?? ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm({ ...form, category: cat })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  form.category === cat
                    ? 'bg-navy text-white'
                    : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                }`}
              >
                {EXPENSE_CATEGORY_ICONS[cat]} <span className="capitalize">{cat}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
            Date *
          </label>
          <input
            type="date"
            className="vintage-input w-full"
            value={form.expense_date}
            required
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
            Notes
          </label>
          <textarea
            className="vintage-input w-full"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/expenses')}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary flex-1 disabled:opacity-50"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Sending…' : '📤 Send to Group for Review'}
          </button>
        </div>
      </form>
    </div>
  );
}
