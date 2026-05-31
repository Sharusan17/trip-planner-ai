import { getCurrencySymbol, ALL_CURRENCIES } from '@/utils/currency';

interface Props {
  price: string;
  currency: string;
  placeholder?: string;
  onPriceChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
}

export default function PriceField({ price, currency, placeholder = '0.00', onPriceChange, onCurrencyChange }: Props) {
  const symbol = getCurrencySymbol(currency);

  return (
    <div className="flex rounded-xl border border-parchment-dark overflow-hidden focus-within:ring-2 focus-within:ring-navy/20 focus-within:border-navy transition-shadow">
      {/* Symbol badge */}
      <span className="flex items-center px-3 bg-parchment border-r border-parchment-dark text-sm font-semibold text-ink-faint select-none shrink-0">
        {symbol}
      </span>

      {/* Amount */}
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm bg-white outline-none min-w-0"
        value={price}
        onChange={(e) => onPriceChange(e.target.value)}
      />

      {/* Currency selector */}
      <select
        className="border-l border-parchment-dark bg-parchment px-2 py-2 text-sm text-ink outline-none cursor-pointer shrink-0"
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
      >
        {ALL_CURRENCIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
