import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { pollsApi } from '@/api/polls';
import type { Poll } from '@trip-planner-ai/shared';
import { BarChart2, Plus, Trash2, Check } from 'lucide-react';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PollCard({
  poll,
  travellerId,
  isOrganiser,
  onVote,
  onDelete,
}: {
  poll: Poll;
  travellerId: string;
  isOrganiser: boolean;
  onVote: (pollId: string, optionId: string) => void;
  onDelete: (pollId: string) => void;
}) {
  const isClosed = poll.closes_at ? new Date(poll.closes_at) < new Date() : false;
  const hasVoted = !!poll.my_vote_option_id;

  return (
    <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-parchment-dark">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
              style={{ backgroundColor: poll.created_by_colour ?? '#2563EB' }}
            >
              {(poll.created_by_name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-display font-semibold text-ink text-base leading-snug">{poll.question}</p>
              <p className="text-xs text-ink-faint font-body mt-0.5">
                {poll.created_by_name} · {timeAgo(poll.created_at)}
                {isClosed && <span className="ml-2 text-terracotta font-medium">• Closed</span>}
              </p>
            </div>
          </div>
          {isOrganiser && (
            <button
              onClick={() => { if (confirm('Delete this poll?')) onDelete(poll.id); }}
              className="text-ink-faint hover:text-terracotta transition-colors flex-shrink-0 p-1"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-2.5">
        {poll.options.map((opt) => {
          const pct = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0;
          const isMyVote = poll.my_vote_option_id === opt.id;
          const showResults = hasVoted || isClosed;

          return (
            <div key={opt.id}>
              {showResults ? (
                /* Results bar */
                <div className={`rounded-lg px-3 py-2.5 relative overflow-hidden border ${isMyVote ? 'border-navy/40 bg-navy/5' : 'border-parchment-dark bg-parchment/40'}`}>
                  {/* Fill bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-navy/10 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isMyVote && <Check size={13} strokeWidth={2.5} className="text-navy" />}
                      <span className="text-sm font-body text-ink">{opt.text}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className="text-xs text-ink-faint font-body">{opt.vote_count} vote{opt.vote_count !== 1 ? 's' : ''}</span>
                      <span className="text-xs font-display font-semibold text-navy w-9 text-right">{pct}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Voting button */
                <button
                  onClick={() => !isClosed && onVote(poll.id, opt.id)}
                  disabled={isClosed}
                  className="w-full text-left rounded-lg px-4 py-2.5 border border-parchment-dark bg-parchment/40 hover:border-navy/40 hover:bg-navy/5 transition-all text-sm font-body text-ink disabled:cursor-not-allowed"
                >
                  {opt.text}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-3 text-xs text-ink-faint font-body">
        {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
        {poll.closes_at && !isClosed && (
          <> · Closes {new Date(poll.closes_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
        )}
      </div>
    </div>
  );
}

export default function PollsPage() {
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: polls = [], isLoading } = useQuery({
    queryKey: ['polls', currentTrip?.id, activeTraveller?.id],
    queryFn: () => pollsApi.list(currentTrip!.id, activeTraveller?.id),
    enabled: !!currentTrip,
  });

  const voteMutation = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      pollsApi.vote(pollId, optionId, activeTraveller!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['polls'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pollsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['polls'] }),
  });

  if (!currentTrip) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-navy">Polls</h2>
          <p className="text-sm text-ink-faint mt-0.5">Vote on trip decisions together</p>
        </div>
        <button onClick={() => navigate('/community/polls/new')} className="btn-primary flex items-center gap-2">
          <Plus size={16} strokeWidth={2} />
          New Poll
        </button>
      </div>

      {/* Polls list */}
      {isLoading ? (
        <div className="vintage-card p-8 text-center text-ink-faint text-sm">Loading…</div>
      ) : polls.length === 0 ? (
        <div className="vintage-card p-12 text-center">
          <BarChart2 size={36} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No polls yet</h3>
          <p className="text-sm text-ink-faint">Create a poll to get everyone's opinion on trip decisions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {polls.map((poll: Poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              travellerId={activeTraveller?.id ?? ''}
              isOrganiser={isOrganiser}
              onVote={(pollId, optionId) => voteMutation.mutate({ pollId, optionId })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
