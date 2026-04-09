import { useState } from 'react';
import TransportPage from './TransportPage';
import AccommodationPage from './AccommodationPage';

type Tab = 'transport' | 'stays';
const TABS: { key: Tab; label: string }[] = [
  { key: 'transport', label: 'Transport' },
  { key: 'stays',     label: 'Stays'     },
];

export default function LogisticsPage() {
  const [tab, setTab] = useState<Tab>('transport');
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? 'bg-navy text-white'
                : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'transport' && <TransportPage />}
      {tab === 'stays'     && <AccommodationPage />}
    </div>
  );
}
