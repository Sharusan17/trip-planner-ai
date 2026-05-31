import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { settlementsApi } from '@/api/settlements';
import { expensesApi } from '@/api/expenses';
import { travellersApi } from '@/api/travellers';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { ArrowLeft, ArrowRight } from 'lucide-react';

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTrip, activeTraveller } = useTrip();
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

  const getName = (tid: string) => travellers.find((t) => t.id === tid)?.name ?? 'Unknown';
  const getColour = (tid: string) => travellers.find((t) => t.id === tid)?.avatar_colour ?? '#94A3B8';

  const markPaidMutation = useMutation({
    mutationFn: () => settlementsApi.markPaid(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', currentTrip?.id] });
      navigate('/expenses?tab=settlements');
    },
    onError: (err) => alert(`Failed to mark as paid: ${(err as Error).message}`),
  });

  // Access guard — only the payer can view this page
  if (currentTrip && activeTraveller && settlement && activeTraveller.id !== settlement.from_traveller) {
    navigate('/expenses?tab=settlements');
    return null;
  }

  if (!currentTrip || !settlement) {
    return (
      <div className="max-w-lg mx-auto">
        <p className="text-ink-faint text-center py-12">Loading…</p>
      </div>
    );
  }

  const fromName = getName(settlement.from_traveller);
  const toName   = getName(settlement.to_traveller);
  const fromColour = getColour(settlement.from_traveller);
  const toColour   = getColour(settlement.to_traveller);

  // Contributing expenses: creditor paid AND debtor has a non-zero split
  const contributing = expenses.filter((exp) => {
    if (exp.paid_by !== settlement.to_traveller) return false;
    const mySplit = exp.splits.find((s) => s.traveller_id === settlement.from_traveller);
    return mySplit && mySplit.amount > 0;
  });

  const isPaid = settlement.status === 'paid';

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses?tab=settlements')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">What you're paying for</h1>
          <p className="text-sm text-ink-faint">Breakdown of your settlement</p>
        </div>
      </div>

      {/* Settlement summary card */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%)' }}
      >
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="flex flex-col items-center gap-1">
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: fromColour }}
            >
              {fromName.charAt(0).toUpperCase()}
            </span>
            <span className="text-xs text-white/80 font-medium">{fromName}</span>
          </div>
          <ArrowRight size={20} className="text-white/60 mt-[-12px]" />
          <div className="flex flex-col items-center gap-1">
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: toColour }}
            >
              {toName.charAt(0).toUpperCase()}
            </span>
            <span className="text-xs text-white/80 font-medium">{toName}</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-3xl font-display font-bold">{fmt(settlement.amount, homeCurrency)}</p>
          <p className="text-sm text-white/70 mt-1">
            {fromName} pays {toName}
            {isPaid && settlement.paid_at && (
              <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                Paid {new Date(settlement.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Contributing expenses */}
      <div>
        <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">
          Expenses covered ({contributing.length})
        </h2>
        {contributing.length === 0 ? (
          <div className="vintage-card text-center py-8">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm text-ink-faint">No expenses found for this settlement.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contributing.map((exp) => {
              const mySplit = exp.splits.find((s) => s.traveller_id === settlement.from_traveller);
              const myShare = mySplit?.amount_home ?? mySplit?.amount ?? 0;
              const myShareCurrency = mySplit?.amount_home != null ? homeCurrency : exp.currency;
              return (
                <div key={exp.id} className="vintage-card p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0">{EXPENSE_CATEGORY_ICONS[exp.category]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm truncate">{exp.description}</p>
                      <p className="text-xs text-ink-faint mt-0.5">
                        {fmtDate(exp.expense_date)}
                        {' · '}
                        <span className="capitalize">{exp.category}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-ink">{fmt(myShare, myShareCurrency)}</p>
                      {exp.amount_home != null && exp.amount_home !== myShare && (
                        <p className="text-xs text-ink-faint">of {fmt(exp.amount_home, homeCurrency)}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mark as Paid */}
      {!isPaid && (
        <button
          className="btn-primary w-full disabled:opacity-50"
          onClick={() => markPaidMutation.mutate()}
          disabled={markPaidMutation.isPending}
        >
          {markPaidMutation.isPending ? 'Marking as paid…' : '✓ Mark as Paid'}
        </button>
      )}
    </div>
  );
}
