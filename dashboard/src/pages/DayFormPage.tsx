import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { ArrowLeft } from 'lucide-react';

export default function DayFormPage() {
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createMutation = useMutation({
    mutationFn: () => itineraryApi.createDay(currentTrip!.id, {
      date,
      day_number: days.length + 1,
      title: title || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['days'] }); navigate('/itinerary'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/itinerary')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Add Day</h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Date *</label>
          <input type="date" className="vintage-input w-full" required value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Day Title (optional)</label>
          <input className="vintage-input w-full" value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Beach Day, City Tour…" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/itinerary')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50"
            disabled={!date || createMutation.isPending}>
            {createMutation.isPending ? 'Adding…' : 'Add Day'}
          </button>
        </div>
      </form>
    </div>
  );
}
