import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { settlementsApi } from '../api/settlements';
import { expensesApi } from '../api/expenses';
import { travellersApi } from '../api/travellers';
import type { Settlement } from '@trip-planner-ai/shared';

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

export default function SettlementsPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ['settlements', currentTrip?.id],
    queryFn: () => settlementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['expenses', 'summary', currentTrip?.id],
    queryFn: () => expensesApi.summary(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const calculateMutation = useMutation({
    mutationFn: () => settlementsApi.calculate(currentTrip!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', currentTrip?.id] });
      setShowConfirm(false);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => settlementsApi.markPaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements', currentTrip?.id] }),
  });

  // Compute net balances from expense summary
  // We can derive rough balances from the settlements themselves, but for a precise view
  // we'll display total spent per person from the API summary
  const totalSpent = summary.reduce((s, r) => s + r.total_home, 0);

  const pending = settlements.filter((s) => s.status === 'pending');
  const paid = settlements.filter((s) => s.status === 'paid');

  function travellerName(id: string) {
    return travellers.find((t) => t.id === id)?.name ?? 'Unknown';
  }

  function travellerColour(id: string) {
    return travellers.find((t) => t.id === id)?.avatar_colour ?? '#1B3A5C';
  }

  // Compute balance from settlements (net flows)
  const balanceMap: Record<string, number> = {};
  for (const s of pending) {
    balanceMap[s.from_traveller] = (balanceMap[s.from_traveller] ?? 0) - s.amount;
    balanceMap[s.to_traveller] = (balanceMap[s.to_traveller] ?? 0) + s.amount;
  }

  if (!currentTrip) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-navy">Settlements</h1>
        {isOrganiser && (
          <button className="btn-primary" onClick={() => setShowConfirm(true)}>
            ⚖️ Calculate
          </button>
        )}
      </div>

      {/* Total spent summary */}
      {totalSpent > 0 && (
        <div className="vintage-card p-4 mb-6 text-center">
          <p className="text-sm text-ink/60">Total Group Spend</p>
          <p className="text-3xl font-bold text-navy mt-1">
            {formatCurrency(totalSpent, currentTrip.home_currency)}
          </p>
        </div>
      )}

      {/* Balance board */}
      {Object.keys(balanceMap).length > 0 && (
        <div className="vintage-card p-4 mb-6">
          <h2 className="text-sm font-semibold text-ink/60 mb-3">Net Balances</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(balanceMap).map(([id, net]) => (
              <div
                key={id}
                className={`rounded-lg p-3 text-center ${net >= 0 ? 'bg-green-50' : 'bg-red-50'}`}
              >
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white mb-1"
                  style={{ backgroundColor: travellerColour(id) }}
                >
                  {travellerName(id).charAt(0).toUpperCase()}
                </span>
                <p className="text-xs font-medium text-ink truncate">{travellerName(id)}</p>
                <p className={`text-sm font-bold mt-0.5 ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net, currentTrip.home_currency)}
                </p>
                <p className="text-xs text-ink/40">{net >= 0 ? 'is owed' : 'owes'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending settlements */}
      {isLoading ? (
        <p className="text-ink/50 text-center py-8">Loading settlements...</p>
      ) : pending.length === 0 && paid.length === 0 ? (
        <div className="vintage-card text-center py-12">
          <p className="text-3xl mb-2">⚖️</p>
          <p className="text-ink/60 mb-2">No settlements calculated yet.</p>
          {isOrganiser && (
            <>
              <p className="text-sm text-ink/40 mb-4">Add expenses first, then calculate to see who owes whom.</p>
              <button className="btn-primary" onClick={() => setShowConfirm(true)}>
                Calculate Settlements
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink/60 mb-3">Outstanding ({pending.length})</h2>
              <div className="space-y-2">
                {pending.map((s) => <SettlementRow key={s.id} settlement={s}
                  travellerName={travellerName} travellerColour={travellerColour}
                  isOrganiser={isOrganiser} homeCurrency={currentTrip.home_currency}
                  onMarkPaid={() => markPaidMutation.mutate(s.id)} />)}
              </div>
            </div>
          )}
          {paid.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink/60 mb-3">Completed ({paid.length})</h2>
              <div className="space-y-2">
                {paid.map((s) => <SettlementRow key={s.id} settlement={s}
                  travellerName={travellerName} travellerColour={travellerColour}
                  isOrganiser={false} homeCurrency={currentTrip.home_currency}
                  onMarkPaid={() => {}} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calculate confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="vintage-card w-full max-w-sm text-center">
            <p className="text-3xl mb-3">⚖️</p>
            <h2 className="text-xl font-display font-bold text-navy mb-2">Recalculate Settlements?</h2>
            <p className="text-sm text-ink/60 mb-6">
              This will replace all pending settlements with fresh calculations based on current expenses.
              Already paid settlements will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-primary flex-1"
                onClick={() => calculateMutation.mutate()}
                disabled={calculateMutation.isPending}
              >
                {calculateMutation.isPending ? 'Calculating...' : 'Calculate'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettlementRow({
  settlement,
  travellerName,
  travellerColour,
  isOrganiser,
  homeCurrency,
  onMarkPaid,
}: {
  settlement: Settlement;
  travellerName: (id: string) => string;
  travellerColour: (id: string) => string;
  isOrganiser: boolean;
  homeCurrency: string;
  onMarkPaid: () => void;
}) {
  const fromName = travellerName(settlement.from_traveller);
  const toName = travellerName(settlement.to_traveller);
  const isPaid = settlement.status === 'paid';

  return (
    <div className={`vintage-card p-4 flex items-center gap-4 ${isPaid ? 'opacity-50' : ''}`}>
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: travellerColour(settlement.from_traveller) }}
      >
        {fromName.charAt(0).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">
          <span className="font-semibold">{fromName}</span>
          <span className="text-ink/50 mx-2">pays</span>
          <span className="font-semibold">{toName}</span>
        </p>
        <p className="text-lg font-bold text-navy">
          {new Intl.NumberFormat('en-GB', { style: 'currency', currency: homeCurrency }).format(settlement.amount)}
        </p>
      </div>
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: travellerColour(settlement.to_traveller) }}
      >
        {toName.charAt(0).toUpperCase()}
      </span>
      {isOrganiser && !isPaid && (
        <button
          onClick={onMarkPaid}
          className="btn-secondary text-xs py-1 px-3 shrink-0"
          title="Mark as paid"
        >
          ✓ Paid
        </button>
      )}
      {isPaid && (
        <span className="badge status-badge-paid text-xs px-2 py-0.5 rounded shrink-0">Paid</span>
      )}
    </div>
  );
}
