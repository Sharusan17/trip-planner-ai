import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { pollsApi } from '@/api/polls';
import { ArrowLeft, X, Plus } from 'lucide-react';

export default function PollFormPage() {
  const navigate = useNavigate();
  const { currentTrip, activeTraveller } = useTrip();
  const qc = useQueryClient();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closesAt, setClosesAt] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: { question: string; options: string[]; created_by: string; closes_at?: string | null }) =>
      pollsApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['polls'] }); navigate('/community'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTraveller) return;
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) return;
    createMutation.mutate({ question: question.trim(), options: validOptions, created_by: activeTraveller.id, closes_at: closesAt || null });
  };

  const validOptions = options.map((o) => o.trim()).filter(Boolean);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/community')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Create Poll</h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Question *</label>
          <input className="vintage-input" required value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which restaurant for dinner on day 3?" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Options *</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-ink-faint w-5 text-center flex-shrink-0">{i + 1}</span>
                <input className="vintage-input flex-1" value={opt}
                  onChange={(e) => {
                    const next = [...options]; next[i] = e.target.value; setOptions(next);
                  }}
                  placeholder={`Option ${i + 1}`} />
                {options.length > 2 && (
                  <button type="button"
                    onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                    className="text-ink-faint hover:text-terracotta transition-colors flex-shrink-0">
                    <X size={16} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setOptions([...options, ''])}
            className="mt-3 flex items-center gap-1.5 text-sm text-navy hover:underline font-body">
            <Plus size={14} />Add option
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Close date (optional)</label>
          <input type="datetime-local" className="vintage-input" value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/community')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit"
            disabled={!question.trim() || validOptions.length < 2 || createMutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50">
            {createMutation.isPending ? 'Creating…' : 'Create Poll'}
          </button>
        </div>
      </form>
    </div>
  );
}
