import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { settlementsApi } from '@/api/settlements';
import { travellersApi } from '@/api/travellers';
import { currencyApi } from '@/api/currency';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';

const ALL_CURRENCIES = [
  'AED','AUD','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP',
  'HKD','HUF','INR','JPY','KRW','MXN','NOK','NZD','PLN','SAR',
  'SEK','SGD','THB','TRY','USD','ZAR',
];

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };
const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

export default function TransferFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip, activeTraveller } = useTrip();
  const qc = useQueryClient();

  const homeCurrency = currentTrip?.home_currency ?? 'GBP';
  const destCurrency = currentTrip?.dest_currency ?? 'EUR';

  const [from, setFrom] = useState(activeTraveller?.id ?? '');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(homeCurrency);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers', currentTrip?.id],
    queryFn: () => settlementsApi.listTransfers(currentTrip!.id),
    enabled: !!currentTrip && isEdit,
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements', currentTrip?.id],
    queryFn: () => settlementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
    staleTime: 30_000,
  });

  // Live home-currency equivalent when a foreign currency is chosen
  const { data: conversion } = useQuery({
    queryKey: ['currency', currency, homeCurrency, amount],
    queryFn: () => currencyApi.convert(currency, homeCurrency, parseFloat(amount) || 0),
    enabled: !!currentTrip && currency !== homeCurrency && parseFloat(amount) > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Pre-fill form when editing
  useEffect(() => {
    if (!isEdit || !id || transfers.length === 0) return;
    const tf = (transfers as any[]).find((t) => t.id === id);
    if (!tf) return;
    setFrom(tf.from_traveller);
    setTo(tf.to_traveller);
    setAmount(String(tf.amount));
    setCurrency(tf.currency);
    setNote(tf.note ?? '');
    setDate(tf.transfer_date.split('T')[0]);
  }, [isEdit, id, transfers]);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof settlementsApi.createTransfer>[1]) =>
      settlementsApi.createTransfer(currentTrip!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
      navigate('/expenses?tab=settlements');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof settlementsApi.updateTransfer>[1]) =>
      settlementsApi.updateTransfer(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
      navigate('/expenses?tab=settlements');
    },
  });

  function handleSwap() {
    setFrom(to);
    setTo(from);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || !amount || parseFloat(amount) <= 0) return;
    const data = {
      from_traveller: from,
      to_traveller: to,
      amount: parseFloat(amount),
      currency,
      note: note || undefined,
      transfer_date: date,
    };
    if (isEdit) updateMutation.mutate(data);
    else createMutation.mutate(data);
  }

  // Net balance hint — only shown when the selected From person genuinely owes the selected To person
  const netHint = (() => {
    if (!from || !to) return null;
    const pending = settlements.filter((s: any) => s.status === 'pending');
    // Only sum in the direction from→to
    const owes = pending
      .filter((s: any) => s.from_traveller === from && s.to_traveller === to)
      .reduce((sum: number, s: any) => sum + s.amount, 0);
    const net = Math.round(owes * 100) / 100;
    if (net < 0.01) return null;
    const fromName = travellers.find((t) => t.id === from)?.name ?? 'Sender';
    const toName   = travellers.find((t) => t.id === to)?.name   ?? 'Receiver';
    return { label: `${fromName} owes ${toName}`, amount: net };
  })();

  const isPending = createMutation.isPending || updateMutation.isPending;
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/expenses?tab=settlements')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {isEdit ? 'Edit Transfer' : 'Record Transfer'}
          </h1>
          <p className="text-sm text-ink-faint">Log a cash payment between two people</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* From / Swap / To */}
        <div className="vintage-card p-5 space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            {/* From */}
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">From</label>
              <div className="space-y-1.5">
                {travellers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={t.id === to}
                    onClick={() => setFrom(t.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left ${
                      from === t.id
                        ? 'border-navy bg-navy/5 ring-1 ring-navy/20'
                        : t.id === to
                        ? 'opacity-30 cursor-not-allowed border-parchment-dark bg-white'
                        : 'border-parchment-dark bg-white hover:bg-parchment/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: t.avatar_colour }}>
                      {t.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-ink truncate">{t.name}</span>
                    {from === t.id && <span className="ml-auto text-navy text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Swap */}
            <button
              type="button"
              onClick={handleSwap}
              disabled={!from || !to}
              className="w-9 h-9 mb-1 rounded-full bg-navy/10 hover:bg-navy/20 flex items-center justify-center text-navy transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Swap direction"
            >
              <ArrowLeftRight size={15} strokeWidth={2} />
            </button>

            {/* To */}
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">To</label>
              <div className="space-y-1.5">
                {travellers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={t.id === from}
                    onClick={() => setTo(t.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-left ${
                      to === t.id
                        ? 'border-navy bg-navy/5 ring-1 ring-navy/20'
                        : t.id === from
                        ? 'opacity-30 cursor-not-allowed border-parchment-dark bg-white'
                        : 'border-parchment-dark bg-white hover:bg-parchment/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: t.avatar_colour }}>
                      {t.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-ink truncate">{t.name}</span>
                    {to === t.id && <span className="ml-auto text-navy text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Net balance hint */}
          {netHint && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">{netHint.label}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-amber-800">{fmt(netHint.amount, homeCurrency)}</p>
                <button
                  type="button"
                  onClick={() => { setAmount(String(netHint.amount)); setCurrency(homeCurrency); }}
                  className="text-[10px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-full transition-colors"
                >
                  Use this
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Amount + Currency */}
        <div className="vintage-card p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Amount</label>
            <div className="flex items-center border border-parchment-dark rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-navy/30">
              <span className="px-3 text-base font-medium text-ink-faint bg-parchment/60 border-r border-parchment-dark self-stretch flex items-center select-none">
                {sym}
              </span>
              <input
                type="number" step="0.01" min="0" required
                className="flex-1 px-3 py-3 text-xl font-display outline-none bg-white"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    amount === String(q)
                      ? 'bg-navy text-white'
                      : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
                  }`}
                >
                  {sym}{q}
                </button>
              ))}
            </div>

            {/* Home equivalent */}
            {conversion && currency !== homeCurrency && parseFloat(amount) > 0 && (
              <p className="text-xs text-ink-faint mt-2 flex items-center gap-1">
                ≈ <span className="font-semibold text-ink">{fmt(conversion.converted, homeCurrency)}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Currency</label>
            <div className="flex flex-wrap gap-1.5">
              {[homeCurrency, ...(destCurrency !== homeCurrency ? [destCurrency] : []), 'USD', 'EUR', 'GBP']
                .filter((c, i, arr) => arr.indexOf(c) === i)
                .map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    currency === c
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white border-parchment-dark text-ink hover:bg-parchment/60'
                  }`}
                >
                  {CURRENCY_SYMBOLS[c] ?? ''} {c}
                </button>
              ))}
              <select
                className="px-2 py-1.5 rounded-lg text-xs border border-parchment-dark text-ink bg-white"
                value={[homeCurrency, destCurrency, 'USD', 'EUR', 'GBP'].includes(currency) ? '' : currency}
                onChange={(e) => { if (e.target.value) setCurrency(e.target.value); }}
              >
                <option value="">More…</option>
                {ALL_CURRENCIES.filter((c) => ![homeCurrency, destCurrency, 'USD', 'EUR', 'GBP'].includes(c)).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date + Note */}
        <div className="vintage-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Date</label>
              <input type="date" className="vintage-input w-full" value={date}
                onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Note (optional)</label>
              <input className="vintage-input w-full" placeholder="e.g. Cash at airport"
                value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate('/expenses?tab=settlements')} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!from || !to || !amount || parseFloat(amount) <= 0 || isPending}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Record Transfer'}
          </button>
        </div>
      </form>
    </div>
  );
}
