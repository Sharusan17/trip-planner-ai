import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expenseClaimsApi } from '@/api/expenseClaims';
import { travellersApi } from '@/api/travellers';
import type { RespondToClaimInput } from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft, X, Heart, Scissors } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function fmtDate(d: string) {
  return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ExpenseClaimReviewPage() {
  const { id } = useParams<{ id?: string }>();
  const { currentTrip } = useTrip();

  if (!currentTrip) return null;

  if (id) return <DetailView id={id} />;
  return <SwipeQueue />;
}

// ---------------------------------------------------------------------------
// VIEW A — Swipe Queue
// ---------------------------------------------------------------------------

function SwipeQueue() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentTrip, activeTraveller } = useTrip();

  // ---- data ----------------------------------------------------------------
  const { data: allClaims = [], isLoading: claimsLoading, isFetching: claimsFetching } = useQuery({
    queryKey: ['claims', currentTrip?.id],
    queryFn: () => expenseClaimsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
    refetchInterval: 15_000,
    staleTime: 0,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  // open claims not created by this traveller, stable order (created_at DESC from server)
  const pendingClaims = allClaims.filter(
    (c) => c.status === 'open' && c.created_by !== activeTraveller?.id
  );

  // ---- state ---------------------------------------------------------------
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [flyDir, setFlyDir] = useState<'left' | 'right' | null>(null);
  const [showPartialSheet, setShowPartialSheet] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [splitWithIds, setSplitWithIds] = useState<string[]>([]);
  const [selectedLineItems, setSelectedLineItems] = useState<number[]>([]);
  const [partialNote, setPartialNote] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // ---- mutation ------------------------------------------------------------
  const respondMutation = useMutation({
    mutationFn: ({ claimId, data }: { claimId: string; data: RespondToClaimInput }) =>
      expenseClaimsApi.respond(claimId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claims'] });
    },
  });

  // ---- drag handlers -------------------------------------------------------
  function handlePointerDown(e: React.PointerEvent) {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setFlyDir(null);
    cardRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    setDragX(e.clientX - dragStartX);
  }

  function handlePointerUp() {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX > 80) commitAction('accepted');
    else if (dragX < -80) commitAction('declined');
    else setDragX(0);
  }

  // ---- commit --------------------------------------------------------------
  async function commitAction(action: 'accepted' | 'declined') {
    const claim = pendingClaims[currentIndex];
    if (!claim || !activeTraveller) return;
    setFlyDir(action === 'accepted' ? 'right' : 'left');
    try {
      await respondMutation.mutateAsync({
        claimId: claim.id,
        data: { traveller_id: activeTraveller.id, action },
      });
    } catch { /* ignore */ }
    setTimeout(() => {
      setCurrentIndex(i => i + 1);
      setDragX(0);
      setFlyDir(null);
    }, 380);
  }

  async function submitPartial() {
    const claim = pendingClaims[currentIndex];
    if (!claim || !activeTraveller || !partialAmount) return;
    setShowPartialSheet(false);
    setFlyDir('right');
    try {
      await respondMutation.mutateAsync({
        claimId: claim.id,
        data: {
          traveller_id: activeTraveller.id,
          action: 'partial',
          claimed_amount: parseFloat(partialAmount),
          split_with_ids: splitWithIds,
          line_item_indices: selectedLineItems.length > 0 ? selectedLineItems : undefined,
          note: partialNote || undefined,
        },
      });
    } catch { /* ignore */ }
    setTimeout(() => {
      setCurrentIndex(i => i + 1);
      setDragX(0);
      setFlyDir(null);
      setPartialAmount('');
      setSplitWithIds([]);
      setSelectedLineItems([]);
      setPartialNote('');
    }, 380);
  }

  // ---- derived -------------------------------------------------------------
  const claim = pendingClaims[currentIndex];
  const nextClaim = pendingClaims[currentIndex + 1];
  const totalCards = pendingClaims.length;
  const anyFetching = claimsLoading || claimsFetching;
  const done = !anyFetching && currentIndex >= totalCards;

  const dragProgress = Math.min(Math.abs(dragX) / 150, 1);
  const tintOpacity = dragProgress * 0.4;
  const stampOpacity = Math.min(Math.max((Math.abs(dragX) - 30) / 60, 0), 1);

  const cardStyle: React.CSSProperties = {
    transform: flyDir === 'right'
      ? 'translateX(150vw) rotate(25deg)'
      : flyDir === 'left'
      ? 'translateX(-150vw) rotate(-25deg)'
      : `translateX(${dragX}px) rotate(${dragX * 0.06}deg)`,
    transition: isDragging ? 'none' : flyDir ? 'transform 0.28s cubic-bezier(0.55,0,1,0.45)' : 'transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
    touchAction: 'none',
    boxShadow: isDragging
      ? `0 ${8 + dragProgress * 24}px ${24 + dragProgress * 32}px rgba(0,0,0,${0.1 + dragProgress * 0.18})`
      : '0 8px 24px rgba(0,0,0,0.10)',
  };

  // ---- render --------------------------------------------------------------
  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#f1f5f9' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses')}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
          style={{ color: 'var(--color-ink-faint)' }}
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold" style={{ color: 'var(--color-ink)' }}>
            Review Claims
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-ink-faint)' }}>
            Swipe right to accept · left to decline
          </p>
        </div>
      </div>

      {anyFetching && totalCards === 0 ? (
        /* ---- Loading ---------------------------------------------------- */
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div className="w-10 h-10 border-4 rounded-full animate-spin"
            style={{ borderColor: '#e2e8f0', borderTopColor: 'var(--color-navy)' }} />
          <p className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>Loading claims…</p>
        </div>
      ) : done ? (
        /* ---- Done ------------------------------------------------------- */
        <div className="flex flex-col items-center justify-center flex-1 px-4">
          <div className="bg-white rounded-3xl text-center py-16 px-8 w-full max-w-sm shadow-xl">
            <p className="text-6xl mb-4">🎉</p>
            <h2 className="font-display text-2xl font-bold" style={{ color: 'var(--color-navy)' }}>
              You're all done!
            </h2>
            <p className="mt-2" style={{ color: 'var(--color-ink-faint)' }}>
              No more claims to review.
            </p>
            <button className="btn-secondary mt-6" onClick={() => navigate('/expenses')}>
              Back to Finance
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1">
          {/* Dot progress */}
          <div className="flex items-center justify-center gap-2 py-3">
            {pendingClaims.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === currentIndex ? '24px' : '8px',
                  height: '8px',
                  backgroundColor: i < currentIndex ? '#cbd5e1' : i === currentIndex ? 'var(--color-navy)' : '#e2e8f0',
                }}
              />
            ))}
          </div>
          <p className="text-center text-xs font-medium mb-4" style={{ color: 'var(--color-ink-faint)' }}>
            {currentIndex + 1} / {totalCards}
          </p>

          {/* Card stack area */}
          <div className="relative mx-4 flex-1" style={{ minHeight: '420px' }}>

            {/* Next card peeking behind */}
            {nextClaim && (
              <div
                className="absolute inset-x-0"
                style={{
                  top: '10px',
                  transform: 'scale(0.94)',
                  transformOrigin: 'bottom center',
                  zIndex: 0,
                  borderRadius: '24px',
                  backgroundColor: 'white',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
                  minHeight: '380px',
                  opacity: 0.6,
                }}
              />
            )}

            {/* Active draggable card */}
            <div
              ref={cardRef}
              className="absolute inset-x-0 select-none cursor-grab active:cursor-grabbing"
              style={{ ...cardStyle, zIndex: 1, borderRadius: '24px', overflow: 'hidden', backgroundColor: 'white', minHeight: '380px' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Green accept tint */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundColor: '#22c55e', opacity: dragX > 0 ? tintOpacity : 0, transition: 'opacity 0.1s' }} />
              {/* Red decline tint */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundColor: '#ef4444', opacity: dragX < 0 ? tintOpacity : 0, transition: 'opacity 0.1s' }} />

              {/* MINE stamp */}
              {dragX > 20 && (
                <div className="absolute top-8 left-6 z-10 pointer-events-none"
                  style={{ opacity: stampOpacity, transform: 'rotate(-18deg)' }}>
                  <div style={{
                    border: '4px solid #16a34a', borderRadius: '10px', padding: '4px 14px',
                    color: '#16a34a', fontWeight: 900, fontSize: '28px', letterSpacing: '2px',
                    fontFamily: 'var(--font-display)',
                  }}>MINE!</div>
                </div>
              )}
              {/* NOPE stamp */}
              {dragX < -20 && (
                <div className="absolute top-8 right-6 z-10 pointer-events-none"
                  style={{ opacity: stampOpacity, transform: 'rotate(18deg)' }}>
                  <div style={{
                    border: '4px solid #dc2626', borderRadius: '10px', padding: '4px 14px',
                    color: '#dc2626', fontWeight: 900, fontSize: '28px', letterSpacing: '2px',
                    fontFamily: 'var(--font-display)',
                  }}>NOPE</div>
                </div>
              )}

              {/* Card content */}
              <div className="p-6 space-y-4">
                <div className="text-center pt-2">
                  <span className="text-6xl">{EXPENSE_CATEGORY_ICONS[claim.category]}</span>
                  <h2 className="font-display text-2xl font-bold mt-3" style={{ color: 'var(--color-ink)' }}>
                    {claim.description}
                  </h2>
                  <p className="text-4xl font-bold mt-1" style={{ color: 'var(--color-navy)' }}>
                    {fmt(claim.total_amount, claim.currency)}
                  </p>
                  <p className="text-xs mt-2" style={{ color: 'var(--color-ink-faint)' }}>
                    {fmtDate(claim.expense_date)} · from {claim.created_by_name ?? '…'}
                  </p>
                </div>

                {claim.receipt_filename && (
                  <img
                    src={expenseClaimsApi.getReceiptUrl(claim.id)}
                    alt="Receipt"
                    className="w-full object-cover"
                    style={{ maxHeight: '120px', borderRadius: '14px', border: '1px solid #e2e8f0' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}

                {claim.line_items && claim.line_items.length > 0 && (
                  <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                      style={{ backgroundColor: '#f8fafc', color: 'var(--color-ink-faint)' }}>
                      Receipt items — tap split to pick yours
                    </div>
                    {claim.line_items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm"
                        style={{ backgroundColor: 'white', borderTop: '1px solid #e2e8f0', color: 'var(--color-ink)' }}>
                        <span className="flex-1 truncate mr-2">{item.description}</span>
                        <span className="font-semibold shrink-0" style={{ color: 'var(--color-navy)' }}>
                          {fmt(item.amount, claim.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {claim.co_split_nomination && (
                  <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '14px', padding: '12px' }}>
                    <p className="text-sm" style={{ color: '#92400e' }}>
                      <strong>{claim.co_split_nomination.nominated_by}</strong> wants to split this with you
                      {' '}({fmt(claim.co_split_nomination.each_amount, claim.currency)} each).
                    </p>
                  </div>
                )}

                {claim.notes && (
                  <p className="text-sm italic text-center" style={{ color: 'var(--color-ink-faint)' }}>
                    {claim.notes}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-5 mt-6 px-4 pb-10">
            {/* Decline */}
            <button
              onClick={() => commitAction('declined')}
              title="Not mine"
              style={{
                width: '68px', height: '68px', borderRadius: '50%',
                backgroundColor: 'white',
                border: '2px solid #fecaca',
                boxShadow: '0 4px 16px rgba(239,68,68,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(239,68,68,0.28)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(239,68,68,0.18)'; }}
              onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
            >
              <X size={28} strokeWidth={2.5} color="#ef4444" />
            </button>

            {/* Split / Partial */}
            <button
              onClick={() => {
                const cur = pendingClaims[currentIndex];
                const nomination = cur?.co_split_nomination;
                setPartialAmount(nomination ? String(nomination.each_amount.toFixed(2)) : String(cur?.total_amount ?? ''));
                setSplitWithIds([]);
                setSelectedLineItems([]);
                setPartialNote('');
                setShowPartialSheet(true);
              }}
              title={claim.line_items?.length ? 'Pick my items' : 'Split / Partial'}
              style={{
                width: '52px', height: '52px', borderRadius: '50%',
                backgroundColor: 'white',
                border: '2px solid #fde68a',
                boxShadow: '0 4px 12px rgba(245,158,11,0.18)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                transition: 'transform 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
            >
              <Scissors size={18} strokeWidth={2} color="#d97706" />
              <span style={{ fontSize: '8px', fontWeight: 700, color: '#d97706', lineHeight: 1 }}>
                {claim.line_items?.length ? 'ITEMS' : 'SPLIT'}
              </span>
            </button>

            {/* Accept */}
            <button
              onClick={() => commitAction('accepted')}
              title="Mine!"
              style={{
                width: '68px', height: '68px', borderRadius: '50%',
                backgroundColor: 'white',
                border: '2px solid #bbf7d0',
                boxShadow: '0 4px 16px rgba(34,197,94,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(34,197,94,0.28)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(34,197,94,0.18)'; }}
              onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
            >
              <Heart size={28} strokeWidth={2} fill="#22c55e" color="#22c55e" />
            </button>
          </div>
        </div>
      )}

      {/* ---- Partial bottom sheet ----------------------------------------- */}
      {showPartialSheet && claim && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(15,23,42,0.4)' }}
            onClick={() => setShowPartialSheet(false)}
          />
          <div className="relative bg-white rounded-t-2xl p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '80vh' }}>
            <h3
              className="font-display text-lg font-bold"
              style={{ color: 'var(--color-navy)' }}
            >
              Split / Partial Claim
            </h3>
            <p className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>
              Enter how much of this expense is yours.
            </p>

            {/* Line items (tick to auto-sum) */}
            {claim.line_items && claim.line_items.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--color-ink-faint)' }}>
                  My Items
                </label>
                <div className="space-y-1.5">
                  {claim.line_items.map((item, i) => {
                    const checked = selectedLineItems.includes(i);
                    return (
                      <label key={i}
                        className="flex items-center gap-2 cursor-pointer p-2 rounded-xl transition-colors"
                        style={{ backgroundColor: checked ? '#eff6ff' : 'transparent' }}>
                        <input type="checkbox" className="accent-navy" checked={checked}
                          onChange={() => {
                            const updated = checked
                              ? selectedLineItems.filter((x) => x !== i)
                              : [...selectedLineItems, i];
                            setSelectedLineItems(updated);
                            const sum = claim.line_items!
                              .filter((_, idx) => updated.includes(idx))
                              .reduce((s, li) => s + li.amount, 0);
                            if (sum > 0) setPartialAmount(sum.toFixed(2));
                          }}
                        />
                        <span className="flex-1 text-sm" style={{ color: 'var(--color-ink)' }}>
                          {item.description}
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--color-navy)' }}>
                          {fmt(item.amount, claim.currency)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--color-ink-faint)' }}>
                  Ticking items auto-fills the amount — or type a custom value below.
                </p>
              </div>
            )}

            {/* My share */}
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--color-ink-faint)' }}
              >
                My Share ({claim.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="vintage-input w-full"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
              />
            </div>

            {/* Split with */}
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: 'var(--color-ink-faint)' }}
              >
                Split with (optional)
              </label>
              <div className="space-y-1.5">
                {travellers
                  .filter((t) => t.id !== activeTraveller?.id)
                  .map((t) => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-navy"
                        checked={splitWithIds.includes(t.id)}
                        onChange={() =>
                          setSplitWithIds((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((x) => x !== t.id)
                              : [...prev, t.id]
                          )
                        }
                      />
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: t.avatar_colour }}
                      >
                        {t.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
                        {t.name}
                      </span>
                    </label>
                  ))}
              </div>
              {splitWithIds.length > 0 && partialAmount && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-ink-faint)' }}>
                  Each person pays{' '}
                  {fmt(
                    parseFloat(partialAmount) / (splitWithIds.length + 1),
                    claim.currency
                  )}
                </p>
              )}
            </div>

            {/* Note */}
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--color-ink-faint)' }}
              >
                Note (optional)
              </label>
              <textarea
                className="vintage-input w-full"
                rows={2}
                placeholder="e.g. I had the pasta…"
                value={partialNote}
                onChange={(e) => setPartialNote(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                className="btn-secondary flex-1"
                onClick={() => setShowPartialSheet(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                disabled={!partialAmount || parseFloat(partialAmount) <= 0}
                onClick={submitPartial}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIEW B — Organiser Detail
// ---------------------------------------------------------------------------

function DetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentTrip } = useTrip();

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claims', id],
    queryFn: () => expenseClaimsApi.getById(id),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const approveMutation = useMutation({
    mutationFn: () => expenseClaimsApi.approve(claim!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['claims'] });
      navigate('/expenses');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => expenseClaimsApi.cancel(claim!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claims'] });
      navigate('/expenses');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-parchment)' }}>
        <p className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>Loading…</p>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-parchment)' }}>
        <p className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>Claim not found.</p>
      </div>
    );
  }

  const respondedIds = new Set((claim.responses ?? []).map((r) => r.traveller_id));
  const unrespondedTravellers = travellers.filter(
    (t) => !respondedIds.has(t.id) && t.id !== claim.created_by
  );

  const totalClaimed = (claim.responses ?? [])
    .filter((r) => r.action !== 'declined')
    .reduce(
      (s, r) =>
        s + (r.action === 'accepted' ? claim.total_amount : (r.claimed_amount ?? 0)),
      0
    );

  const responseProgress =
    ((claim.response_count ?? 0) / Math.max(1, claim.total_travellers ?? 1)) * 100;

  const actionBadgeClass = (action: string) => {
    if (action === 'accepted') return 'badge badge-green';
    if (action === 'partial') return 'badge badge-gold';
    return 'badge badge-terracotta';
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-parchment)' }}>
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-12 space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/expenses')}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors flex-shrink-0 mt-0.5"
            style={{ color: 'var(--color-ink-faint)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-parchment-dark)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl">{EXPENSE_CATEGORY_ICONS[claim.category]}</span>
              <h1
                className="font-display text-xl font-bold truncate"
                style={{ color: 'var(--color-ink)' }}
              >
                {claim.description}
              </h1>
              <span
                className={`badge text-xs ${
                  claim.status === 'approved'
                    ? 'badge-green'
                    : claim.status === 'cancelled'
                    ? 'badge-terracotta'
                    : 'badge-gold'
                }`}
              >
                {claim.status}
              </span>
            </div>
            <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--color-navy)' }}>
              {fmt(claim.total_amount, claim.currency)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-faint)' }}>
              {fmtDate(claim.expense_date)} · sent by {claim.created_by_name}
            </p>
          </div>
        </div>

        {/* Receipt */}
        {claim.receipt_filename && (
          <img
            src={expenseClaimsApi.getReceiptUrl(claim.id)}
            alt="Receipt"
            className="w-full object-cover rounded-xl border"
            style={{ maxHeight: '192px', borderColor: 'var(--color-parchment-dark)' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        {/* Notes */}
        {claim.notes && (
          <p className="text-sm italic" style={{ color: 'var(--color-ink-faint)' }}>
            {claim.notes}
          </p>
        )}

        {/* Response progress */}
        <div className="vintage-card p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium" style={{ color: 'var(--color-ink)' }}>
              Responses
            </span>
            <span style={{ color: 'var(--color-ink-faint)' }}>
              {claim.response_count ?? 0} / {claim.total_travellers ?? 0} responded
            </span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${responseProgress}%` }} />
          </div>
        </div>

        {/* Responses list */}
        <div className="vintage-card p-4 space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-ink-faint)' }}>
            Responses
          </h2>

          {(claim.responses ?? []).length === 0 && unrespondedTravellers.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>
              No responses yet.
            </p>
          )}

          {/* Responded */}
          {(claim.responses ?? []).map((r) => (
            <div key={r.id} className="flex items-start gap-3">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: r.traveller_colour ?? '#94a3b8' }}
              >
                {(r.traveller_name ?? '?').charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
                    {r.traveller_name ?? 'Unknown'}
                  </span>
                  <span className={actionBadgeClass(r.action)}>{r.action}</span>
                  {r.action === 'partial' && r.claimed_amount != null && (
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>
                      {fmt(r.claimed_amount, claim.currency)}
                    </span>
                  )}
                </div>
                {r.line_item_indices && r.line_item_indices.length > 0 && claim.line_items && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-faint)' }}>
                    Items: {r.line_item_indices
                      .map((i) => claim.line_items![i]?.description)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {r.note && (
                  <p className="text-xs mt-0.5 italic" style={{ color: 'var(--color-ink-faint)' }}>
                    {r.note}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Unresponded */}
          {unrespondedTravellers.map((t) => (
            <div key={t.id} className="flex items-center gap-3 opacity-50">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: t.avatar_colour }}
              >
                {t.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
                {t.name}
              </span>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-ink-faint)' }}>
                Waiting…
              </span>
            </div>
          ))}
        </div>

        {/* Total claimed vs claim total */}
        <div className="vintage-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--color-ink-faint)' }}>Total claimed</span>
            <span className="font-bold" style={{ color: 'var(--color-ink)' }}>
              {fmt(totalClaimed, claim.currency)} / {fmt(claim.total_amount, claim.currency)}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        {claim.status === 'open' && (
          <div className="flex gap-3">
            <button
              className="btn-primary flex-1 disabled:opacity-50"
              onClick={() => approveMutation.mutate()}
              disabled={
                approveMutation.isPending ||
                (claim.responses ?? []).filter((r) => r.action !== 'declined').length === 0
              }
            >
              {approveMutation.isPending ? 'Approving…' : '✓ Approve & Create Expense'}
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm('Cancel this claim? All responses will be lost.'))
                  cancelMutation.mutate();
              }}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </button>
          </div>
        )}

        {claim.status === 'approved' && (
          <div
            className="vintage-card p-4 text-center"
            style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}
          >
            <p className="font-semibold" style={{ color: '#15803d' }}>
              ✓ Approved — expense has been created
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
