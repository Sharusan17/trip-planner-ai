import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { transportApi } from '@/api/transport';
import type { CreateVehicleInput } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';

export default function VehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [seatCount, setSeatCount] = useState('5');
  const [notes, setNotes] = useState('');

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', currentTrip?.id],
    queryFn: () => transportApi.listVehicles(currentTrip!.id),
    enabled: !!currentTrip && isEdit,
  });

  useEffect(() => {
    if (!isEdit || !id || vehicles.length === 0) return;
    const v = vehicles.find((x) => x.id === id);
    if (!v) return;
    setName(v.name);
    setSeatCount(String(v.seat_count));
    setNotes(v.notes ?? '');
  }, [isEdit, id, vehicles]);

  const createMutation = useMutation({
    mutationFn: (data: CreateVehicleInput) => transportApi.createVehicle(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); navigate('/logistics'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: vid, data }: { id: string; data: Partial<CreateVehicleInput> }) =>
      transportApi.updateVehicle(vid, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); navigate('/logistics'); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateVehicleInput = {
      name, seat_count: parseInt(seatCount) || 5, notes: notes || undefined,
    };
    if (isEdit && id) updateMutation.mutate({ id, data });
    else createMutation.mutate(data);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/logistics')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEdit ? 'Edit Vehicle' : 'Add Vehicle'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Vehicle Name *</label>
          <input className="vintage-input w-full" required value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rental Ford Focus, João's Car" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Seat Count</label>
          <input type="number" min="1" max="50" className="vintage-input w-full" value={seatCount}
            onChange={(e) => setSeatCount(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Notes</label>
          <textarea className="vintage-input w-full" rows={3} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Rental ref, parking info…" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/logistics')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1 disabled:opacity-50" disabled={!name.trim() || isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Vehicle'}
          </button>
        </div>
      </form>
    </div>
  );
}
