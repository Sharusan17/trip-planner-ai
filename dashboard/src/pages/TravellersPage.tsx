import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import { familiesApi } from '@/api/families';
import type { Traveller } from '@trip-planner-ai/shared';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, User, Baby, Pencil, Crown, Trash2, Users } from 'lucide-react';

export default function TravellersPage() {
  const { currentTrip, isOrganiser, activeTraveller } = useTrip();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pinInput, setPinInput] = useState<{ id: string; pin: string } | null>(null);
  const [revealedNotes, setRevealedNotes] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!currentTrip) return;
    navigator.clipboard.writeText(currentTrip.group_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const deleteTravellerMutation = useMutation({
    mutationFn: (id: string) => travellersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['travellers'] });
      queryClient.invalidateQueries({ queryKey: ['families'] });
    },
  });

  const deleteFamilyMutation = useMutation({
    mutationFn: (id: string) => familiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['families'] });
      queryClient.invalidateQueries({ queryKey: ['travellers'] });
    },
  });

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

  // Build a set of traveller IDs that belong to a family
  const familyMemberIds = new Set(families.flatMap((f) => f.members.map((m) => m.id)));
  const individuals = travellers.filter((t) => !familyMemberIds.has(t.id));

  function TravellerCard({ t, isLead }: { t: Traveller; isLead?: boolean }) {
    return (
      <div className="vintage-card p-4">
        <div className="flex items-start gap-3">
          {t.has_photo ? (
            <img
              src={travellersApi.getPhotoUrl(t.id)}
              alt={t.name}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-parchment-light shrink-0"
              style={{ backgroundColor: t.avatar_colour }}
            >
              {t.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base font-semibold truncate flex items-center gap-1.5">
              {t.name}
              {isLead && <Crown size={13} className="text-amber-500 flex-shrink-0" strokeWidth={2} />}
              {t.type === 'infant'
                ? <Baby size={14} className="text-terracotta shrink-0" strokeWidth={2} />
                : t.type === 'child'
                ? <User size={13} className="text-gold-aged shrink-0" strokeWidth={2.5} />
                : null}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`badge capitalize text-[10px] ${t.type === 'child' ? 'badge-gold' : t.type === 'infant' ? 'badge-terracotta' : 'badge-navy'}`}>
                {t.type}
              </span>
              {t.role === 'organiser' && (
                <span className="badge badge-gold capitalize text-[10px]">{t.role}</span>
              )}
              <span className="text-[10px] text-ink-faint">{t.cost_split_weight}×</span>
            </div>
          </div>
        </div>

        {/* Medical notes */}
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
                  type="password" maxLength={4} placeholder="PIN"
                  className="vintage-input w-20 text-center tracking-widest"
                  value={pinInput.pin}
                  onChange={(e) => setPinInput({ id: t.id, pin: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin(t.id)}
                />
                <button onClick={() => handleVerifyPin(t.id)} className="btn-primary text-xs py-1 px-2">Unlock</button>
                <button onClick={() => setPinInput(null)} className="text-xs text-ink-faint">Cancel</button>
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

        {/* Bio / notes */}
        {t.notes && (
          <p className="mt-2 text-xs text-ink-light italic leading-snug line-clamp-2">{t.notes}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-gold/20">
          {activeTraveller?.id === t.id && (
            <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-xs text-navy font-display">
              <Pencil size={11} /> Edit My Profile
            </button>
          )}
          {isOrganiser && activeTraveller?.id !== t.id && (
            <>
              <button onClick={() => navigate(`/travellers/${t.id}/edit`)} className="text-xs text-navy font-display">Edit</button>
              <button
                onClick={() => { if (confirm(`Remove ${t.name}?`)) deleteTravellerMutation.mutate(t.id); }}
                className="text-xs text-terracotta font-display"
              >
                Remove
              </button>
            </>
          )}
          {isOrganiser && activeTraveller?.id === t.id && (
            <>
              <span className="text-ink-faint/40">·</span>
              <button onClick={() => navigate(`/travellers/${t.id}/edit`)} className="text-xs text-ink-faint font-display">
                Edit (organiser view)
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl font-bold text-navy">Travellers</h2>
        {isOrganiser && (
          <div className="flex gap-2">
            <button onClick={() => navigate('/families/add')} className="btn-secondary flex items-center gap-1.5">
              <Users size={14} strokeWidth={2} /> Add Family
            </button>
            <button onClick={() => navigate('/travellers/add')} className="btn-primary">
              + Add Traveller
            </button>
          </div>
        )}
      </div>

      {/* Share This Trip */}
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
              <code className="flex-1 bg-white text-ink text-xl tracking-[0.3em] font-mono px-4 py-2.5 rounded-xl text-center border-2 border-ink">
                {currentTrip.group_code}
              </code>
              <button onClick={handleCopy} className="flex items-center gap-1.5 btn-secondary py-2.5 px-3 text-sm flex-shrink-0">
                {copied ? <Check size={14} strokeWidth={2.5} className="text-green-600" /> : <Copy size={14} strokeWidth={2} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-2">
              Join at <span className="font-mono">{window.location.origin}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Family sections */}
      {families.map((family) => {
        const memberTravellers = travellers.filter((t) =>
          family.members.some((m) => m.id === t.id)
        );
        const totalWeight = family.members.reduce((s, m) => s + m.cost_split_weight, 0);

        return (
          <div key={family.id}>
            {/* Family header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: family.colour }} />
                <h3 className="font-display text-lg font-semibold text-ink">{family.name}</h3>
                <span className="text-xs text-ink-faint">
                  {family.members.length} member{family.members.length !== 1 ? 's' : ''} · {totalWeight}× total weight
                </span>
              </div>
              {isOrganiser && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/families/${family.id}/edit`)}
                    className="w-7 h-7 rounded-lg border border-parchment-dark flex items-center justify-center text-ink-faint hover:text-navy hover:border-navy/30 transition-colors"
                    title="Edit family"
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${family.name}"? All members will become individuals.`))
                        deleteFamilyMutation.mutate(family.id);
                    }}
                    className="w-7 h-7 rounded-lg border border-parchment-dark flex items-center justify-center text-ink-faint hover:text-terracotta hover:border-terracotta/30 transition-colors"
                    title="Delete family"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {memberTravellers.map((t) => (
                <TravellerCard key={t.id} t={t} isLead={t.id === family.lead_traveller_id} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Individuals (no family) */}
      {individuals.length > 0 && (
        <div>
          {families.length > 0 && (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-6 h-6 rounded-full bg-parchment-dark flex-shrink-0" />
              <h3 className="font-display text-lg font-semibold text-ink">Individuals</h3>
              <span className="text-xs text-ink-faint">{individuals.length} traveller{individuals.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {individuals.map((t) => (
              <TravellerCard key={t.id} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {travellers.length === 0 && (
        <div className="vintage-card p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No travellers yet</h3>
          <p className="text-sm text-ink-faint">Add your group members to get started</p>
        </div>
      )}
    </div>
  );
}
