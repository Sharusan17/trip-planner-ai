import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { currentTrip, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements', currentTrip?.id],
    queryFn: () => announcementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
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
          <button onClick={() => navigate('/community/announcements/new')} className="btn-primary flex items-center gap-2">
            <Plus size={16} strokeWidth={2} />
            New Post
          </button>
        )}
      </div>

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
