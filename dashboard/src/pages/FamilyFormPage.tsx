import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { familiesApi } from '@/api/families';
import { travellersApi } from '@/api/travellers';
import { ArrowLeft } from 'lucide-react';

const AVATAR_COLOURS = [
  '#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A',
  '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574',
];

export default function FamilyFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { currentTrip, isOrganiser } = useTrip();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [colour, setColour] = useState(AVATAR_COLOURS[0]);
  const [leadId, setLeadId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);

  // Redirect non-organisers
  useEffect(() => {
    if (!isOrganiser) navigate('/travellers');
  }, [isOrganiser, navigate]);

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: families = [] } = useQuery({
    queryKey: ['families', currentTrip?.id],
    queryFn: () => familiesApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  // Pre-fill when editing
  useEffect(() => {
    if (!isEdit || families.length === 0) return;
    const fam = families.find((f) => f.id === id);
    if (!fam) return;
    setName(fam.name);
    setColour(fam.colour);
    setLeadId(fam.lead_traveller_id);
    setMemberIds(fam.members.map((m) => m.id));
  }, [isEdit, id, families]);

  // Auto-add lead to members when lead changes
  useEffect(() => {
    if (leadId && !memberIds.includes(leadId)) {
      setMemberIds((prev) => [...prev, leadId]);
    }
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMutation = useMutation({
    mutationFn: () => familiesApi.create(currentTrip!.id, {
      name: name.trim(), lead_traveller_id: leadId, colour, member_ids: memberIds,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['families'] });
      qc.invalidateQueries({ queryKey: ['travellers'] });
      navigate('/travellers');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => familiesApi.update(id!, {
      name: name.trim(), lead_traveller_id: leadId, colour, member_ids: memberIds,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['families'] });
      qc.invalidateQueries({ queryKey: ['travellers'] });
      navigate('/travellers');
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Travellers eligible for this family = not in any OTHER family
  const eligibleTravellers = travellers.filter((t) => {
    if (!t.family_id) return true;               // unattached — eligible
    if (isEdit) {
      // In edit mode: already in THIS family is eligible
      const thisFamily = families.find((f) => f.id === id);
      return thisFamily?.members.some((m) => m.id === t.id);
    }
    return false;
  });

  function toggleMember(tid: string) {
    if (tid === leadId) return; // can't deselect the lead
    setMemberIds((prev) =>
      prev.includes(tid) ? prev.filter((x) => x !== tid) : [...prev, tid]
    );
  }

  const canSave = name.trim() && leadId && memberIds.length > 0;

  if (!currentTrip) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/travellers')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEdit ? 'Edit Family' : 'Add Family'}
        </h1>
      </div>

      <div className="vintage-card p-6 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Family Name *</label>
          <input
            className="vintage-input w-full"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smith family"
          />
        </div>

        {/* Colour */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Colour</label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                className={`w-9 h-9 rounded-full border-2 transition-all ${colour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          {name && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: colour }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-ink font-medium">{name}</span>
            </div>
          )}
        </div>

        {/* Lead */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Family Lead *</label>
          <p className="text-xs text-ink-faint mb-2">The lead pays/receives on behalf of the family in settlements.</p>
          <select
            className="vintage-input w-full"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
          >
            <option value="">Select a lead…</option>
            {eligibleTravellers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Members */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Members *</label>
          <p className="text-xs text-ink-faint mb-2">The lead is always included. Travellers already in another family are not shown.</p>
          <div className="space-y-1.5">
            {eligibleTravellers.map((t) => {
              const isLead = t.id === leadId;
              const checked = memberIds.includes(t.id);
              return (
                <label key={t.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  checked ? 'border-navy/30 bg-navy/5' : 'border-parchment-dark hover:bg-parchment/40'
                } ${isLead ? 'cursor-default' : ''}`}>
                  <input
                    type="checkbox"
                    className="accent-navy"
                    checked={checked}
                    disabled={isLead}
                    onChange={() => toggleMember(t.id)}
                  />
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: t.avatar_colour }}>
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-ink flex-1">{t.name}</span>
                  <div className="flex items-center gap-1.5">
                    {isLead && (
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Lead</span>
                    )}
                    <span className="text-xs text-ink-faint capitalize">{t.type}</span>
                    <span className="text-xs text-ink-faint">({t.cost_split_weight}×)</span>
                  </div>
                </label>
              );
            })}
            {eligibleTravellers.length === 0 && (
              <p className="text-sm text-ink-faint p-3 text-center">All travellers are already in other families.</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/travellers')} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || isPending}
            onClick={() => isEdit ? updateMutation.mutate() : createMutation.mutate()}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Family'}
          </button>
        </div>
      </div>
    </div>
  );
}
