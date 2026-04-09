import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { pollsApi } from '@/api/polls';
import type { Poll } from '@trip-planner-ai/shared';
import { BarChart2, Plus, Trash2, Check, X } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closesAt, setClosesAt] = useState('');

  const { data: polls = [], isLoading } = useQuery({
    queryKey: ['polls', currentTrip?.id, activeTraveller?.id],
    queryFn: () => pollsApi.list(currentTrip!.id, activeTraveller?.id),
    enabled: !!currentTrip,
  });

  const createMutation = useMutation({
    mutationFn: (data: { question: string; options: string[]; created_by: string; closes_at?: string | null }) =>
      pollsApi.create(currentTrip!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      resetForm();
    },
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

  const resetForm = () => {
    setShowForm(false);
    setQuestion('');
    setOptions(['', '']);
    setClosesAt('');
  };

  const handleAddOption = () => setOptions([...options, '']);
  const handleRemoveOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== i));
  };
  const handleOptionChange = (i: number, val: string) => {
    const next = [...options];
    next[i] = val;
    setOptions(next);
  };

  const handleSubmit = () => {
    if (!activeTraveller) return;
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || validOptions.length < 2) return;
    createMutation.mutate({
      question: question.trim(),
      options: validOptions,
      created_by: activeTraveller.id,
      closes_at: closesAt || null,
    });
  };

  if (!currentTrip) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-navy">Polls</h2>
          <p className="text-sm text-ink-faint mt-0.5">Vote on trip decisions together</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} strokeWidth={2} />
          New Poll
        </button>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-[var(--shadow-elevated)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink mb-4">Create Poll</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Question *</label>
                <input
                  className="vintage-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Which restaurant for dinner on day 3?"
                />
              </div>

              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Options *</label>
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className="vintage-input flex-1"
                        value={opt}
                        onChange={(e) => handleOptionChange(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                      />
                      {options.length > 2 && (
                        <button onClick={() => handleRemoveOption(i)} className="text-ink-faint hover:text-terracotta transition-colors">
                          <X size={16} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddOption}
                  className="mt-2 text-xs text-navy hover:underline font-body"
                >
                  + Add option
                </button>
              </div>

              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Close date (optional)</label>
                <input
                  type="datetime-local"
                  className="vintage-input"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={resetForm} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || createMutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Poll'}
              </button>
            </div>
          </div>
        </div>
      )}

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
