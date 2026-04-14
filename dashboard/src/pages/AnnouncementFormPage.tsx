import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { announcementsApi } from '@/api/announcements';
import { ArrowLeft } from 'lucide-react';

export default function AnnouncementFormPage() {
  const navigate = useNavigate();
  const { currentTrip, activeTraveller } = useTrip();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string; author_id: string; pinned: boolean }) =>
      announcementsApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); navigate('/community'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTraveller) return;
    createMutation.mutate({ title, content, author_id: activeTraveller.id, pinned });
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/community')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">New Announcement</h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Title *</label>
          <input className="vintage-input" required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Flight change, Meeting point update…" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Content *</label>
          <textarea className="vintage-input" rows={6} required value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your announcement here…" />
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-navy rounded" checked={pinned}
            onChange={(e) => setPinned(e.target.checked)} />
          <span className="text-sm font-body text-ink">Pin this announcement to the top</span>
        </label>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/community')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit"
            disabled={!title.trim() || !content.trim() || createMutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50">
            {createMutation.isPending ? 'Posting…' : 'Post Announcement'}
          </button>
        </div>
      </form>
    </div>
  );
}
