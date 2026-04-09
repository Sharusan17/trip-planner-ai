import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import type { Traveller, CreateTravellerInput, TravellerType, TravellerRole } from '@trip-planner-ai/shared';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check } from 'lucide-react';

const AVATAR_COLOURS = ['#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A', '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574'];

export default function TravellersPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState<{ id: string; pin: string } | null>(null);
  const [revealedNotes, setRevealedNotes] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!currentTrip) return;
    navigator.clipboard.writeText(currentTrip.group_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Form state
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

  const createMutation = useMutation({
    mutationFn: (data: CreateTravellerInput) => travellersApi.create(currentTrip!.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['travellers'] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => travellersApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['travellers'] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => travellersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['travellers'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setType('adult');
    setRole('member');
    setColour(AVATAR_COLOURS[0]);
    setWeight('1.00');
    setMedicalNotes('');
    setMedicalPin('');
  };

  const openEdit = (t: Traveller) => {
    setEditingId(t.id);
    setName(t.name);
    setType(t.type);
    setRole(t.role);
    setColour(t.avatar_colour);
    setWeight(String(t.cost_split_weight));
    setMedicalNotes('');
    setMedicalPin('');
    setShowForm(true);
  };

  const handleSubmit = () => {
    const data: any = {
      name, type, role, avatar_colour: colour,
      cost_split_weight: parseFloat(weight),
    };
    if (medicalNotes) data.medical_notes = medicalNotes;
    if (medicalPin) data.medical_pin = medicalPin;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleVerifyPin = async (id: string) => {
    if (!pinInput || pinInput.id !== id) return;
    try {
      const result = await travellersApi.verifyPin(id, pinInput.pin);
      setRevealedNotes((prev) => ({ ...prev, [id]: result.medical_notes }));
      setPinInput(null);
    } catch {
      alert('Invalid PIN');
    }
  };

  if (!currentTrip) return null;
  const shareUrl = `${window.location.origin}/?code=${currentTrip.group_code}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-navy">Travellers</h2>
        {isOrganiser && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
            + Add Traveller
          </button>
        )}
      </div>

      {/* ── Share This Trip ── */}
      <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-parchment-dark">
          <h3 className="font-display text-base font-semibold text-ink">Share This Trip</h3>
          <p className="text-xs text-ink-faint mt-0.5">Invite others to join using the code or QR</p>
        </div>
        <div className="p-5 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-shrink-0 text-center">
            <div className="bg-parchment rounded-xl p-3 inline-block">
              <QRCodeSVG value={shareUrl} size={110} fgColor="#0F172A" bgColor="transparent" />
            </div>
            <p className="text-xs text-ink-faint mt-1.5">Scan to join</p>
          </div>
          <div className="flex-1 w-full">
            <p className="text-sm text-ink-light mb-2">Group code:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-ink text-blue-300 text-xl tracking-[0.3em] font-mono px-4 py-2.5 rounded-xl text-center">
                {currentTrip.group_code}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 btn-secondary py-2.5 px-3 text-sm flex-shrink-0"
              >
                {copied
                  ? <Check size={14} strokeWidth={2.5} className="text-green-600" />
                  : <Copy size={14} strokeWidth={2} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-2">
              Join at <span className="font-mono">{window.location.origin}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Traveller cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {travellers.map((t) => (
          <div key={t.id} className="vintage-card p-4">
            <div className="flex items-start gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-parchment-light shrink-0"
                style={{ backgroundColor: t.avatar_colour }}
              >
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-semibold truncate">{t.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`badge ${t.type === 'child' ? 'badge-gold' : t.type === 'infant' ? 'badge-terracotta' : 'badge-navy'}`}>
                    {t.type}
                  </span>
                  <span className={`badge ${t.role === 'organiser' ? 'badge-gold' : 'badge-navy'}`}>
                    {t.role}
                  </span>
                </div>
                <div className="text-xs text-ink-faint mt-2">
                  Cost split: {t.cost_split_weight}x
                </div>
              </div>
            </div>

            {/* Medical notes section */}
            {t.has_medical_pin && (
              <div className="mt-3 pt-3 border-t border-gold/20">
                {revealedNotes[t.id] ? (
                  <div className="text-sm">
                    <span className="font-display text-xs text-ink-light">Medical Notes:</span>
                    <p className="mt-1 text-ink">{revealedNotes[t.id]}</p>
                    <button
                      onClick={() => setRevealedNotes((prev) => { const n = { ...prev }; delete n[t.id]; return n; })}
                      className="text-xs text-terracotta mt-1"
                    >
                      Hide
                    </button>
                  </div>
                ) : pinInput?.id === t.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="PIN"
                      className="vintage-input w-20 text-center tracking-widest"
                      value={pinInput.pin}
                      onChange={(e) => setPinInput({ id: t.id, pin: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin(t.id)}
                    />
                    <button onClick={() => handleVerifyPin(t.id)} className="btn-primary text-xs py-1 px-2">
                      Unlock
                    </button>
                    <button onClick={() => setPinInput(null)} className="text-xs text-ink-faint">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setPinInput({ id: t.id, pin: '' })}
                    className="text-xs text-navy font-display flex items-center gap-1"
                  >
                    🔒 View Medical Notes
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            {isOrganiser && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-gold/20">
                <button onClick={() => openEdit(t)} className="text-xs text-navy font-display">Edit</button>
                <button
                  onClick={() => { if (confirm(`Remove ${t.name}?`)) deleteMutation.mutate(t.id); }}
                  className="text-xs text-terracotta font-display"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {travellers.length === 0 && (
        <div className="vintage-card p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No travellers yet</h3>
          <p className="text-sm text-ink-faint">Add your group members to get started</p>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => resetForm()}>
          <div className="vintage-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-navy mb-4">
              {editingId ? 'Edit Traveller' : 'Add Traveller'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Name *</label>
                <input className="vintage-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">Type</label>
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
                  <label className="block text-sm font-display text-ink-light mb-1">Role</label>
                  <select className="vintage-input" value={role} onChange={(e) => setRole(e.target.value as TravellerRole)}>
                    <option value="member">Member</option>
                    <option value="organiser">Organiser</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Avatar Colour</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLOURS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColour(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${colour === c ? 'border-navy scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Cost Split Weight</label>
                <input className="vintage-input" type="number" step="0.05" min="0" max="2" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <p className="text-xs text-ink-faint mt-1">1.0 = full share, 0.5 = half, 0 = none</p>
              </div>

              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Medical Notes (optional)</label>
                <textarea className="vintage-input" rows={3} value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} placeholder="Allergies, medications, conditions..." />
              </div>

              {medicalNotes && (
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">PIN to protect medical notes</label>
                  <input className="vintage-input w-32 text-center tracking-widest" type="password" maxLength={4} placeholder="4 digits" value={medicalPin} onChange={(e) => setMedicalPin(e.target.value.replace(/\D/g, ''))} />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={resetForm} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSubmit} className="btn-primary flex-1">
                {editingId ? 'Save Changes' : 'Add Traveller'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
