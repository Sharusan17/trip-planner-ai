import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import type { CreateTravellerInput, TravellerType, TravellerRole } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';

const AVATAR_COLOURS = ['#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A', '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574'];

export default function TravellerFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { currentTrip } = useTrip();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [type, setType] = useState<TravellerType>('adult');
  const [role, setRole] = useState<TravellerRole>('member');
  const [colour, setColour] = useState(AVATAR_COLOURS[0]);
  const [weight, setWeight] = useState('1.00');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [medicalPin, setMedicalPin] = useState('');

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  // Populate form when editing
  useEffect(() => {
    if (isEditing && travellers.length > 0) {
      const t = travellers.find((x) => x.id === id);
      if (t) {
        setName(t.name);
        setType(t.type);
        setRole(t.role);
        setColour(t.avatar_colour);
        setWeight(String(t.cost_split_weight));
      }
    }
  }, [id, isEditing, travellers]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTravellerInput) => travellersApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travellers'] }); navigate('/travellers'); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => travellersApi.update(id!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travellers'] }); navigate('/travellers'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { name, type, role, avatar_colour: colour, cost_split_weight: parseFloat(weight) };
    if (medicalNotes) data.medical_notes = medicalNotes;
    if (medicalPin) data.medical_pin = medicalPin;
    if (isEditing) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/travellers')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEditing ? 'Edit Traveller' : 'Add Traveller'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Name *</label>
          <input className="vintage-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Type</label>
            <select className="vintage-input" value={type} onChange={(e) => {
              const v = e.target.value as TravellerType;
              setType(v);
              setWeight(v === 'infant' ? '0.00' : v === 'child' ? '0.50' : '1.00');
            }}>
              <option value="adult">Adult</option>
              <option value="child">Child</option>
              <option value="infant">Infant</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Role</label>
            <select className="vintage-input" value={role} onChange={(e) => setRole(e.target.value as TravellerRole)}>
              <option value="member">Member</option>
              <option value="organiser">Organiser</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Avatar Colour</label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLOURS.map((c) => (
              <button key={c} type="button" onClick={() => setColour(c)}
                className={`w-9 h-9 rounded-full border-2 transition-all ${colour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          {/* Preview */}
          <div className="mt-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base"
              style={{ backgroundColor: colour }}>
              {name ? name.charAt(0).toUpperCase() : '?'}
            </div>
            <span className="text-sm text-ink-faint">{name || 'Preview'}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Cost Split Weight</label>
          <input className="vintage-input" type="number" step="0.05" min="0" max="2" value={weight}
            onChange={(e) => setWeight(e.target.value)} />
          <p className="text-xs text-ink-faint mt-1">1.0 = full share · 0.5 = half · 0 = excluded</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Medical Notes (optional)</label>
          <textarea className="vintage-input" rows={3} value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            placeholder="Allergies, medications, conditions…" />
        </div>

        {medicalNotes && (
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">PIN to protect medical notes</label>
            <input className="vintage-input w-36 text-center tracking-widest" type="password"
              maxLength={4} placeholder="4 digits"
              value={medicalPin}
              onChange={(e) => setMedicalPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/travellers')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={isPending || !name.trim()} className="btn-primary flex-1 disabled:opacity-50">
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Traveller'}
          </button>
        </div>
      </form>
    </div>
  );
}
