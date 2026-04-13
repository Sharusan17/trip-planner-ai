import { useState } from 'react';
import AnnouncementsPage from './AnnouncementsPage';
import PollsPage from './PollsPage';
import PhotoAlbumPage from './PhotoAlbumPage';

type Tab = 'updates' | 'polls' | 'photos';
const TABS: { key: Tab; label: string }[] = [
  { key: 'updates', label: 'Updates' },
  { key: 'polls',   label: 'Polls'   },
  { key: 'photos',  label: 'Photos'  },
];

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>('updates');
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

      {tab === 'updates' && <AnnouncementsPage />}
      {tab === 'polls'   && <PollsPage />}
      {tab === 'photos'  && <PhotoAlbumPage />}
    </div>
  );
}
