import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { currencyApi } from '@/api/currency';

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$',
};

export default function CurrencyPage() {
  const { currentTrip } = useTrip();
  const [amount, setAmount] = useState('50');
  const [direction, setDirection] = useState<'home-to-dest' | 'dest-to-home'>('home-to-dest');

  const homeCurrency = currentTrip?.home_currency || 'GBP';
  const destCurrency = currentTrip?.dest_currency || 'EUR';

  const from = direction === 'home-to-dest' ? homeCurrency : destCurrency;
  const to = direction === 'home-to-dest' ? destCurrency : homeCurrency;

  const { data: conversion, isLoading } = useQuery({
    queryKey: ['currency', from, to, amount],
    queryFn: () => currencyApi.convert(from, to, parseFloat(amount) || 0),
    enabled: !!currentTrip && parseFloat(amount) > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rateInfo } = useQuery({
    queryKey: ['currency-rate', homeCurrency, destCurrency],
    queryFn: () => currencyApi.rate(homeCurrency, destCurrency),
    enabled: !!currentTrip,
    staleTime: 5 * 60 * 1000,
  });

  const quickAmounts = [10, 20, 50, 100, 200];

  const timeSince = useCallback((dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }, []);

  if (!currentTrip) return null;

  const fromSymbol = CURRENCY_SYMBOLS[from] || from;
  const toSymbol = CURRENCY_SYMBOLS[to] || to;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="font-display text-2xl font-bold text-navy">Currency Converter</h2>

      {/* Rate context */}
      {rateInfo && (
        <div className="vintage-card p-4 text-center">
          <div className="font-display text-lg">
            1 {CURRENCY_SYMBOLS[homeCurrency]} = <span className="font-bold text-navy">{rateInfo.rate.toFixed(4)}</span> {CURRENCY_SYMBOLS[destCurrency]}
          </div>
          <div className="text-xs text-ink-faint mt-1">
            Updated {timeSince(rateInfo.fetched_at)}
          </div>
        </div>
      )}

      {/* Converter */}
      <div className="vintage-card map-grid p-6">
        <div className="relative z-10 space-y-4">
          {/* From */}
          <div>
            <label className="block text-sm font-display text-ink-light mb-1">
              {from}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-faint">{fromSymbol}</span>
              <input
                className="vintage-input pl-8 text-2xl font-display"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Swap button */}
          <div className="flex justify-center">
            <button
              onClick={() => setDirection((d) => d === 'home-to-dest' ? 'dest-to-home' : 'home-to-dest')}
              className="w-10 h-10 rounded-full bg-navy text-parchment-light flex items-center justify-center text-lg hover:bg-navy-light transition-colors"
            >
              ⇅
            </button>
          </div>

          {/* To */}
          <div>
            <label className="block text-sm font-display text-ink-light mb-1">
              {to}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-faint">{toSymbol}</span>
              <div className="vintage-input pl-8 text-2xl font-display bg-parchment-dark/50 min-h-[3rem] flex items-center">
                {isLoading ? '...' : conversion ? conversion.converted.toFixed(2) : '0.00'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick amounts */}
      <div>
        <p className="text-sm font-display text-ink-light mb-2">Quick convert</p>
        <div className="flex gap-2 flex-wrap">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(String(amt))}
              className={`px-4 py-2 rounded-sm font-display text-sm transition-all ${
                amount === String(amt)
                  ? 'bg-navy text-parchment-light'
                  : 'bg-parchment-dark/50 text-ink-light hover:bg-parchment-dark'
              }`}
            >
              {fromSymbol}{amt}
            </button>
          ))}
        </div>
      </div>

      {/* Quick reference table */}
      <div className="vintage-card p-4">
        <h3 className="font-display text-sm font-semibold text-navy mb-3">Quick Reference</h3>
        <div className="space-y-1">
          {[5, 10, 20, 50, 100, 200, 500].map((amt) => {
            const rate = rateInfo?.rate || 0;
            return (
              <div key={amt} className="flex justify-between text-sm py-1 border-b border-gold/10 last:border-0">
                <span>{CURRENCY_SYMBOLS[homeCurrency]}{amt}</span>
                <span className="font-mono text-ink-light">
                  {CURRENCY_SYMBOLS[destCurrency]}{(amt * rate).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
