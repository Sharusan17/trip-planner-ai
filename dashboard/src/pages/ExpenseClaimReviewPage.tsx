import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expenseClaimsApi } from '@/api/expenseClaims';
import { travellersApi } from '@/api/travellers';
import type { RespondToClaimInput } from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft } from 'lucide-react';

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
  // Use allClaims (same query as the Finance claims tab) and filter client-side.
  // This avoids depending on the /pending/:travellerId endpoint which can return
  // stale or incorrect results depending on cache state.

  const { data: allClaims = [], isLoading: claimsLoading, isFetching: claimsFetching } = useQuery({
    queryKey: ['claims', currentTrip?.id],
    queryFn: () => expenseClaimsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
    refetchInterval: 15_000,
    staleTime: 0,
  });

  // Claims this traveller can respond to: open + not created by them
  const pendingClaims = allClaims.filter(
    (c) => c.status === 'open' && c.created_by !== activeTraveller?.id
  );

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

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
  const totalCards = pendingClaims.length;
  // Only treat as "done" once we've confirmed the server returned the list
  // (prevents the empty-array initial value or a stale cache hit from
  // immediately triggering the "all done" state before data arrives).
  const anyFetching = claimsLoading || claimsFetching;
  const done = !anyFetching && currentIndex >= totalCards;

  const tintOpacity = Math.min(Math.abs(dragX) / 150, 0.45);

  const cardStyle: React.CSSProperties = {
    transform: flyDir === 'right'
      ? 'translateX(120vw) rotate(20deg)'
      : flyDir === 'left'
      ? 'translateX(-120vw) rotate(-20deg)'
      : `translateX(${dragX}px) rotate(${dragX * 0.08}deg)`,
    transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
    touchAction: 'none',
  };

  // ---- render --------------------------------------------------------------

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-parchment)' }}>
      {/* Page header */}
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors"
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
        /* ---- Loading / refreshing state --------------------------------- */
        <div className="flex flex-col items-center justify-center py-24 px-4 gap-3">
          <div className="w-10 h-10 border-4 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-parchment-dark)', borderTopColor: 'var(--color-navy)' }} />
          <p className="text-sm" style={{ color: 'var(--color-ink-faint)' }}>Loading claims…</p>
        </div>
      ) : done ? (
        /* ---- Empty / done state ----------------------------------------- */
        <div className="vintage-card text-center py-16 mx-4 mt-4">
          <p className="text-5xl mb-4">🎉</p>
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
      ) : (
        <>
          {/* ---- Progress indicator -------------------------------------- */}
          <div className="flex flex-col items-center gap-2 px-4 mb-4">
            <p className="text-sm font-medium" style={{ color: 'var(--color-ink-faint)' }}>
              {currentIndex + 1} of {totalCards} claim{totalCards !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-1.5">
              {pendingClaims.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: i === currentIndex ? '20px' : '8px',
                    height: '8px',
                    backgroundColor: i < currentIndex
                      ? 'var(--color-ink-faint)'
                      : i === currentIndex
                      ? 'var(--color-navy)'
                      : 'var(--color-parchment-dark)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* ---- Draggable card ------------------------------------------ */}
          <div
            ref={cardRef}
            className="relative select-none cursor-grab active:cursor-grabbing"
            style={cardStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="vintage-card p-6 mx-4 space-y-4 overflow-hidden"
              style={{ minHeight: '400px' }}
            >
              {/* Green tint overlay */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity"
                style={{
                  opacity: dragX > 0 ? tintOpacity : 0,
                  backgroundColor: '#22c55e',
                }}
              />
              {/* Red tint overlay */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity"
                style={{
                  opacity: dragX < 0 ? tintOpacity : 0,
                  backgroundColor: '#ef4444',
                }}
              />

              {/* MINE! / NOPE stamps */}
              {dragX > 30 && (
                <div className="absolute top-6 left-6 rotate-[-15deg] border-4 border-green-500 rounded-xl px-3 py-1 text-green-600 font-bold text-xl pointer-events-none z-10">
                  MINE!
                </div>
              )}
              {dragX < -30 && (
                <div className="absolute top-6 right-6 rotate-[15deg] border-4 border-red-500 rounded-xl px-3 py-1 text-red-600 font-bold text-xl pointer-events-none z-10">
                  NOPE
                </div>
              )}

              {/* Card content */}
              <div className="relative z-0 text-center pt-2">
                <span className="text-5xl">{EXPENSE_CATEGORY_ICONS[claim.category]}</span>
                <h2
                  className="font-display text-xl font-bold mt-3"
                  style={{ color: 'var(--color-navy)' }}
                >
                  {claim.description}
                </h2>
                <p className="text-3xl font-bold mt-1" style={{ color: 'var(--color-ink)' }}>
                  {fmt(claim.total_amount, claim.currency)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-ink-faint)' }}>
                  {fmtDate(claim.expense_date)} · posted by {claim.created_by_name ?? '…'}
                </p>
              </div>

              {/* Receipt thumbnail */}
              {claim.receipt_filename && (
                <img
                  src={expenseClaimsApi.getReceiptUrl(claim.id)}
                  alt="Receipt"
                  className="w-full object-cover rounded-xl border"
                  style={{ maxHeight: '128px', borderColor: 'var(--color-parchment-dark)' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}

              {/* Line items from receipt */}
              {claim.line_items && claim.line_items.length > 0 && (
                <div className="relative z-0 rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--color-parchment-dark)' }}>
                  <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink-faint)' }}>
                    Receipt items — tap 🤝 to pick yours
                  </div>
                  {claim.line_items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm"
                      style={{
                        backgroundColor: 'white',
                        borderTop: '1px solid var(--color-parchment-dark)',
                        color: 'var(--color-ink)',
                      }}>
                      <span className="flex-1 truncate mr-2">{item.description}</span>
                      <span className="font-semibold shrink-0" style={{ color: 'var(--color-navy)' }}>
                        {fmt(item.amount, claim.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Co-splitter nomination banner */}
              {claim.co_split_nomination && (
                <div className="relative z-0 rounded-xl p-3 text-sm"
                  style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p style={{ color: '#92400e' }}>
                    <strong>{claim.co_split_nomination.nominated_by}</strong> said they'd split this with you
                    {' '}({fmt(claim.co_split_nomination.each_amount, claim.currency)} each).
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>
                    You can accept that share via 🤝, pay a different amount, or decline.
                  </p>
                </div>
              )}

              {claim.notes && (
                <p
                  className="text-sm italic text-center relative z-0"
                  style={{ color: 'var(--color-ink-faint)' }}
                >
                  {claim.notes}
                </p>
              )}
            </div>
          </div>

          {/* ---- Action buttons ------------------------------------------ */}
          <div className="flex items-center justify-center gap-6 mt-6 px-4">
            {/* Decline */}
            <button
              onClick={() => commitAction('declined')}
              className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-300 text-3xl
                         flex items-center justify-center hover:bg-red-200 transition-colors shadow-sm"
              title="Not mine"
            >
              ❌
            </button>

            {/* Partial / Pick items */}
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
              className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl
                         bg-amber-100 border-2 border-amber-300 hover:bg-amber-200 transition-colors shadow-sm"
              title={claim.line_items?.length ? 'Pick my items' : 'Split / Partial'}
            >
              <span className="text-xl leading-none">🤝</span>
              <span className="text-[9px] font-bold text-amber-700 mt-0.5 leading-none">
                {claim.line_items?.length ? 'MY ITEMS' : 'PARTIAL'}
              </span>
            </button>

            {/* Accept */}
            <button
              onClick={() => commitAction('accepted')}
              className="w-16 h-16 rounded-full bg-green-100 border-2 border-green-300 text-3xl
                         flex items-center justify-center hover:bg-green-200 transition-colors shadow-sm"
              title="Mine!"
            >
              ✅
            </button>
          </div>
        </>
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
