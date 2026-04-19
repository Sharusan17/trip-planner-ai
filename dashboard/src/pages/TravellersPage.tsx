import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, User, Baby } from 'lucide-react';

const AVATAR_COLOURS = ['#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A', '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574'];

export default function TravellersPage() {
  const { currentTrip, isOrganiser } = useTrip();
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => travellersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['travellers'] }),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-navy">Travellers</h2>
        {isOrganiser && (
          <button onClick={() => navigate('/travellers/add')} className="btn-primary">
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
              <code className="flex-1 bg-white text-ink text-xl tracking-[0.3em] font-mono px-4 py-2.5 rounded-xl text-center border-2 border-ink">
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
                <h3 className="font-display text-lg font-semibold truncate flex items-center gap-1.5">
                  {t.name}
                  {t.type === 'infant'
                    ? <Baby size={15} className="text-terracotta shrink-0" strokeWidth={2} />
                    : t.type === 'child'
                    ? <User size={14} className="text-gold-aged shrink-0" strokeWidth={2.5} />
                    : <User size={14} className="text-navy shrink-0" strokeWidth={2} />}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`badge capitalize ${t.type === 'child' ? 'badge-gold' : t.type === 'infant' ? 'badge-terracotta' : 'badge-navy'}`}>
                    {t.type}
                  </span>
                  <span className={`badge capitalize ${t.role === 'organiser' ? 'badge-gold' : 'badge-navy'}`}>
                    {t.role}
                  </span>
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
                <button onClick={() => navigate(`/travellers/${t.id}/edit`)} className="text-xs text-navy font-display">Edit</button>
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

    </div>
  );
}
