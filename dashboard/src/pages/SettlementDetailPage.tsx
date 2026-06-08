import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { settlementsApi } from '@/api/settlements';
import { expensesApi } from '@/api/expenses';
import { travellersApi } from '@/api/travellers';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const qc = useQueryClient();

  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements', currentTrip?.id],
    queryFn: () => settlementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', currentTrip?.id],
    queryFn: () => expensesApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const settlement = settlements.find((s) => s.id === id);
  const homeCurrency = currentTrip?.home_currency ?? 'GBP';

  const getName  = (tid: string) => travellers.find((t) => t.id === tid)?.name ?? 'Unknown';
  const getColour = (tid: string) => travellers.find((t) => t.id === tid)?.avatar_colour ?? '#94A3B8';

  const markPaidMutation = useMutation({
    mutationFn: () => settlementsApi.markPaid(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', currentTrip?.id] });
      navigate('/expenses?tab=settlements');
    },
    onError: (err) => alert(`Failed to mark as paid: ${(err as Error).message}`),
  });

  // Access guard — payer or organiser only
  const isPayer = activeTraveller?.id === settlement?.from_traveller;
  if (currentTrip && activeTraveller && settlement && !isPayer && !isOrganiser) {
    navigate('/expenses?tab=settlements');
    return null;
  }

  if (!currentTrip || !settlement) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <p className="text-ink-faint text-center py-16">Loading…</p>
      </div>
    );
  }

  const fromName   = getName(settlement.from_traveller);
  const toName     = getName(settlement.to_traveller);
  const fromColour = getColour(settlement.from_traveller);
  const toColour   = getColour(settlement.to_traveller);
  const isPaid     = settlement.status === 'paid';

  // Contributing expenses: creditor paid AND debtor has a non-zero split
  const contributing = expenses.filter((exp) => {
    if (exp.paid_by !== settlement.to_traveller) return false;
    const split = exp.splits.find((s) => s.traveller_id === settlement.from_traveller);
    return split && split.amount > 0;
  });

  const debtorShareTotal = contributing.reduce((sum, exp) => {
    const split = exp.splits.find((s) => s.traveller_id === settlement.from_traveller);
    return sum + (split?.amount_home ?? split?.amount ?? 0);
  }, 0);

  const pageTitle = isPayer ? "What you're paying for" : `${fromName}'s settlement`;
  const pageSubtitle = isPayer ? 'Breakdown of your settlement' : `Breakdown of what ${fromName} owes ${toName}`;

  return (
    <div className="max-w-2xl mx-auto px-0 sm:px-4 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses?tab=settlements')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink shrink-0"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-ink leading-tight">{pageTitle}</h1>
          <p className="text-sm text-ink-faint">{pageSubtitle}</p>
        </div>
      </div>

      {/* ── Settlement hero card ── */}
      <div
        className="rounded-2xl overflow-hidden text-white"
        style={{ background: 'linear-gradient(135deg, #0f2952 0%, #1D4ED8 60%, #3B82F6 100%)' }}
      >
        {/* Paid ribbon */}
        {isPaid && settlement.paid_at && (
          <div className="bg-emerald-500/20 border-b border-white/10 px-5 py-2 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-300" />
            <span className="text-xs font-semibold text-emerald-200">
              Paid on {new Date(settlement.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}

        <div className="px-6 py-6">
          {/* Transfer row */}
          <div className="flex items-center justify-center gap-6 mb-5">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <span
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
                style={{ backgroundColor: fromColour }}
              >
                {fromName.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-white/90 truncate max-w-[80px] sm:max-w-[120px] text-center">{fromName}</span>
              <span className="text-[10px] text-white/50 uppercase tracking-wider">payer</span>
            </div>

            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5">
                <ArrowRight size={16} className="text-white/80" />
              </div>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">pays</span>
            </div>

            <div className="flex flex-col items-center gap-2 min-w-0">
              <span
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
                style={{ backgroundColor: toColour }}
              >
                {toName.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-white/90 truncate max-w-[80px] sm:max-w-[120px] text-center">{toName}</span>
              <span className="text-[10px] text-white/50 uppercase tracking-wider">recipient</span>
            </div>
          </div>

          {/* Amount */}
          <div className="text-center border-t border-white/10 pt-5">
            <p className="text-4xl sm:text-5xl font-display font-bold tracking-tight">
              {fmt(settlement.amount, homeCurrency)}
            </p>
            {contributing.length > 0 && Math.abs(debtorShareTotal - settlement.amount) > 0.05 && (
              <p className="text-xs text-white/50 mt-1">
                Net of all shared expenses · {fmt(debtorShareTotal, homeCurrency)} gross share
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Expense list ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
            Expenses covered ({contributing.length})
          </h2>
          {contributing.length > 0 && (
            <span className="text-xs text-ink-faint">
              {fromName}'s share shown
            </span>
          )}
        </div>

        {contributing.length === 0 ? (
          <div className="vintage-card text-center py-10">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-semibold text-ink mb-1">No direct expenses found</p>
            <p className="text-sm text-ink-faint max-w-xs mx-auto">
              This settlement may arise from multi-party netting across the group.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {contributing.map((exp) => {
              const split = exp.splits.find((s) => s.traveller_id === settlement.from_traveller);
              const share     = split?.amount_home ?? split?.amount ?? 0;
              const shareCcy  = split?.amount_home != null ? homeCurrency : exp.currency;
              const totalAmt  = exp.amount_home ?? exp.amount;
              const totalCcy  = exp.amount_home != null ? homeCurrency : exp.currency;
              const pctOfTotal = totalAmt > 0 ? Math.round((share / totalAmt) * 100) : 0;
              return (
                <div key={exp.id} className="vintage-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">{EXPENSE_CATEGORY_ICONS[exp.category]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm leading-snug">{exp.description}</p>
                      <p className="text-xs text-ink-faint mt-0.5">
                        {fmtDate(exp.expense_date)}
                        <span className="mx-1 opacity-40">·</span>
                        <span className="capitalize">{exp.category}</span>
                      </p>
                      {/* Share bar */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-parchment-dark overflow-hidden">
                          <div
                            className="h-full rounded-full bg-navy"
                            style={{ width: `${pctOfTotal}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-ink-faint shrink-0">{pctOfTotal}% of total</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-bold text-ink text-base">{fmt(share, shareCcy)}</p>
                      <p className="text-xs text-ink-faint">of {fmt(totalAmt, totalCcy)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Mark as Paid ── */}
      {!isPaid && (isOrganiser || isPayer) && (
        <div className="pb-4">
          <button
            className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50"
            onClick={() => markPaidMutation.mutate()}
            disabled={markPaidMutation.isPending}
          >
            {markPaidMutation.isPending ? 'Marking as paid…' : '✓ Mark as Paid'}
          </button>
        </div>
      )}
    </div>
  );
}
