import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { announcementsApi } from '@/api/announcements';
import type { Announcement } from '@trip-planner-ai/shared';
import { Megaphone, Pin, PinOff, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AnnouncementsPage() {
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements', currentTrip?.id],
    queryFn: () => announcementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string; author_id: string; pinned: boolean }) =>
      announcementsApi.create(currentTrip!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      resetForm();
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      announcementsApi.pin(id, pinned),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setTitle('');
    setContent('');
    setPinned(false);
  };

  const handleSubmit = () => {
    if (!title.trim() || !content.trim() || !activeTraveller) return;
    createMutation.mutate({ title, content, author_id: activeTraveller.id, pinned });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!currentTrip) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-navy">Announcements</h2>
          <p className="text-sm text-ink-faint mt-0.5">Trip updates from organisers</p>
        </div>
        {isOrganiser && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} strokeWidth={2} />
            New Post
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-[var(--shadow-elevated)] w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink mb-4">New Announcement</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Title *</label>
                <input
                  className="vintage-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Flight change, Meeting point update..."
                />
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Content *</label>
                <textarea
                  className="vintage-input"
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your announcement here..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-parchment-dark"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                />
                <span className="text-sm font-body text-ink-light">Pin this announcement</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={resetForm} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || !content.trim() || createMutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announcements list */}
      {isLoading ? (
        <div className="vintage-card p-8 text-center text-ink-faint text-sm">Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="vintage-card p-12 text-center">
          <Megaphone size={36} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No announcements yet</h3>
          <p className="text-sm text-ink-faint">
            {isOrganiser ? 'Post the first update for your group.' : 'Organisers will post updates here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a: Announcement) => {
            const isExpanded = expanded[a.id] ?? false;
            const isLong = a.content.length > 200;

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border shadow-[var(--shadow-card)] overflow-hidden transition-all ${
                  a.pinned ? 'border-navy/30' : 'border-parchment-dark'
                }`}
              >
                {/* Pinned banner */}
                {a.pinned && (
                  <div className="flex items-center gap-1.5 px-4 py-1.5 bg-navy/5 border-b border-navy/10">
                    <Pin size={11} strokeWidth={2.5} className="text-navy" />
                    <span className="text-[11px] font-display font-semibold text-navy tracking-wide uppercase">Pinned</span>
                  </div>
                )}

                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: a.author_colour ?? '#2563EB' }}
                    >
                      {(a.author_name ?? '?').charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display font-semibold text-ink text-base leading-snug">{a.title}</h3>
                        <span className="text-xs text-ink-faint font-body flex-shrink-0">{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="text-xs text-ink-faint font-body mt-0.5">{a.author_name}</p>

                      <div className="mt-2">
                        <p className={`text-sm text-ink-light font-body leading-relaxed ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
                          {a.content}
                        </p>
                        {isLong && (
                          <button
                            onClick={() => toggleExpand(a.id)}
                            className="flex items-center gap-1 text-xs text-navy font-body mt-1 hover:underline"
                          >
                            {isExpanded ? (
                              <><ChevronUp size={12} />Show less</>
                            ) : (
                              <><ChevronDown size={12} />Read more</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Organiser actions */}
                  {isOrganiser && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-parchment-dark">
                      <button
                        onClick={() => pinMutation.mutate({ id: a.id, pinned: !a.pinned })}
                        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-navy transition-colors font-body"
                      >
                        {a.pinned ? (
                          <><PinOff size={13} strokeWidth={2} />Unpin</>
                        ) : (
                          <><Pin size={13} strokeWidth={2} />Pin</>
                        )}
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this announcement?')) deleteMutation.mutate(a.id); }}
                        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-terracotta transition-colors font-body"
                      >
                        <Trash2 size={13} strokeWidth={2} />Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
