import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { expensesApi } from '../api/expenses';
import { travellersApi } from '../api/travellers';
import { settlementsApi } from '../api/settlements';
import { depositsApi } from '../api/deposits';
import { currencyApi } from '../api/currency';
import { familiesApi } from '../api/families';
import { expenseClaimsApi } from '../api/expenseClaims';
import type { ExpenseClaim } from '@trip-planner-ai/shared';
import { API_BASE } from '../api/client';
import type {
  Expense, ExpenseCategory, Settlement, Deposit, DepositStatus,
} from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import { parseLocalDate } from '@/utils/date';

// ─── constants ───────────────────────────────────────────────────────────────

type MainTab = 'expenses' | 'settlements' | 'deposits' | 'currency' | 'budget' | 'claims';

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'expenses',    label: 'Expenses'    },
  { key: 'settlements', label: 'Settlements' },
  { key: 'deposits',    label: 'Deposits'    },
  { key: 'currency',    label: 'Currency'    },
  { key: 'budget',      label: 'Budget'      },
  { key: 'claims',      label: 'Claims'      },
];

const CATEGORIES: ExpenseCategory[] = [
  'accommodation', 'food', 'transport', 'activities', 'shopping', 'other',
];

const DEPOSIT_STATUS_TABS: { key: 'all' | DepositStatus; label: string }[] = [
  { key: 'all',     label: 'All'     },
  { key: 'pending', label: 'Pending' },
  { key: 'paid',    label: 'Paid'    },
  { key: 'overdue', label: 'Overdue' },
];

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };
const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function fmtDate(d: string) {
  return parseLocalDate(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function groupByDate(expenses: Expense[]): { date: string; items: Expense[] }[] {
  const map: Record<string, Expense[]> = {};
  for (const e of expenses) {
    if (!map[e.expense_date]) map[e.expense_date] = [];
    map[e.expense_date].push(e);
  }
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function depositStatusBadge(status: DepositStatus) {
  if (status === 'paid')    return 'status-badge-paid';
  if (status === 'overdue') return 'status-badge-overdue';
  return 'status-badge-pending';
}

// ─── SettlementRow ────────────────────────────────────────────────────────────

function SettlementRow({
  settlement, getName, getColour, isOrganiser, homeCurrency, onMarkPaid,
}: {
  settlement: Settlement;
  getName: (id: string) => string;
  getColour: (id: string) => string;
  isOrganiser: boolean;
  homeCurrency: string;
  onMarkPaid: () => void;
}) {
  const fromName = getName(settlement.from_traveller);
  const toName   = getName(settlement.to_traveller);
  const isPaid   = settlement.status === 'paid';
  return (
    <div className={`vintage-card p-4 flex items-center gap-4 ${isPaid ? 'opacity-50' : ''}`}>
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: getColour(settlement.from_traveller) }}>
        {fromName.charAt(0).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">
          <span className="font-semibold">{fromName}</span>
          <span className="text-ink/50 mx-2">pays</span>
          <span className="font-semibold">{toName}</span>
        </p>
        <p className="text-lg font-bold text-navy">{fmt(settlement.amount, homeCurrency)}</p>
      </div>
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: getColour(settlement.to_traveller) }}>
        {toName.charAt(0).toUpperCase()}
      </span>
      {isOrganiser && !isPaid && (
        <button onClick={onMarkPaid} className="btn-secondary text-xs py-1 px-3 shrink-0">✓ Paid</button>
      )}
      {isPaid && <span className="badge status-badge-paid text-xs px-2 py-0.5 rounded shrink-0">Paid</span>}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  // ── tab state
  const initialTab = searchParams.get('tab') as MainTab | null;
  const [tab, setTab] = useState<MainTab>(
    initialTab && MAIN_TABS.some((t) => t.key === initialTab) ? initialTab : 'expenses'
  );

  // ── expenses state
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory | 'all'>('all');
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [budgetInputs, setBudgetInputs] = useState<Record<ExpenseCategory, string>>({
    accommodation: '', food: '', transport: '', activities: '', shopping: '', other: '',
  });
  const [savingBudgets, setSavingBudgets] = useState(false);

  // ── settlements state
  const [showCalcConfirm, setShowCalcConfirm] = useState(false);
  const [familyView, setFamilyView] = useState(false);
  const [expandedFamilyGroups, setExpandedFamilyGroups] = useState<Set<string>>(new Set());

  // ── deposits state
  const [depositStatusTab, setDepositStatusTab] = useState<'all' | DepositStatus>('all');

  // ── currency state
  const [currAmount, setCurrAmount] = useState('50');
  const [currDir, setCurrDir] = useState<'home-to-dest' | 'dest-to-home'>('home-to-dest');

  // ── queries
  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ['expenses', currentTrip?.id],
    queryFn: () => expensesApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });
  const { data: expSummary = [] } = useQuery({
    queryKey: ['expenses', 'summary', currentTrip?.id],
    queryFn: () => expensesApi.summary(currentTrip!.id),
    enabled: !!currentTrip, staleTime: 30_000,
  });
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', currentTrip?.id],
    queryFn: () => expensesApi.getBudgets(currentTrip!.id),
    enabled: !!currentTrip,
  });
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });
  const { data: settlements = [], isLoading: settLoading } = useQuery({
    queryKey: ['settlements', currentTrip?.id],
    queryFn: () => settlementsApi.list(currentTrip!.id),
    enabled: !!currentTrip && tab === 'settlements',
  });
  const { data: families = [] } = useQuery({
    queryKey: ['families', currentTrip?.id],
    queryFn: () => familiesApi.list(currentTrip!.id),
    enabled: !!currentTrip && tab === 'settlements',
  });
  const { data: allClaims = [] } = useQuery({
    queryKey: ['claims', currentTrip?.id],
    queryFn: () => expenseClaimsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
    refetchInterval: 15_000,
  });
  const { data: pendingClaims = [] } = useQuery({
    queryKey: ['claims', 'pending', currentTrip?.id, activeTraveller?.id],
    queryFn: () => expenseClaimsApi.listPending(currentTrip!.id, activeTraveller!.id),
    enabled: !!currentTrip && !!activeTraveller,
    refetchInterval: 15_000,
    staleTime: 0,
  });
  const pendingClaimCount = pendingClaims.length;
  const { data: deposits = [], isLoading: depLoading } = useQuery({
    queryKey: ['deposits', currentTrip?.id],
    queryFn: () => depositsApi.list(currentTrip!.id),
    enabled: !!currentTrip && tab === 'deposits',
  });
  const { data: depSummary } = useQuery({
    queryKey: ['deposits', 'summary', currentTrip?.id],
    queryFn: () => depositsApi.summary(currentTrip!.id),
    enabled: !!currentTrip && tab === 'deposits',
  });

  const homeCurrency  = currentTrip?.home_currency ?? 'GBP';
  const destCurrency  = currentTrip?.dest_currency  ?? 'EUR';
  const currFrom = currDir === 'home-to-dest' ? homeCurrency : destCurrency;
  const currTo   = currDir === 'home-to-dest' ? destCurrency : homeCurrency;

  const { data: conversion } = useQuery({
    queryKey: ['currency', currFrom, currTo, currAmount],
    queryFn: () => currencyApi.convert(currFrom, currTo, parseFloat(currAmount) || 0),
    enabled: !!currentTrip && tab === 'currency' && parseFloat(currAmount) > 0,
    staleTime: 5 * 60 * 1000,
  });
  const { data: rateInfo } = useQuery({
    queryKey: ['currency-rate', homeCurrency, destCurrency],
    queryFn: () => currencyApi.rate(homeCurrency, destCurrency),
    enabled: !!currentTrip && tab === 'currency',
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (budgets.length > 0) {
      const inputs: Record<string, string> = {};
      for (const b of budgets) inputs[b.category] = String(b.amount);
      setBudgetInputs((prev) => ({ ...prev, ...inputs }));
    }
  }, [budgets]);

  // ── expense mutations
  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  // ── settlement mutations
  const calculateMutation = useMutation({
    mutationFn: () => settlementsApi.calculate(currentTrip!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settlements'] }); setShowCalcConfirm(false); },
  });
  const markPaidMutation = useMutation({
    mutationFn: (id: string) => settlementsApi.markPaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  });

  // ── deposit mutations
  const depositStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DepositStatus }) =>
      depositsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deposits'] }),
  });
  const deleteDepositMutation = useMutation({
    mutationFn: (id: string) => depositsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deposits'] }),
  });

  // ── settlement helpers
  const getName   = (id: string) => travellers.find((t) => t.id === id)?.name ?? 'Unknown';
  const getColour = (id: string) => travellers.find((t) => t.id === id)?.avatar_colour ?? '#2563EB';

  // ── family grouping helpers (for settlements family view)
  const travellerFamilyMap: Record<string, string> = {};
  for (const fam of families) {
    for (const m of fam.members) travellerFamilyMap[m.id] = fam.id;
  }
  function getFamilyKey(tid: string) {
    const famId = travellerFamilyMap[tid];
    if (famId) {
      const fam = families.find((f) => f.id === famId);
      if (fam) return { key: `fam:${famId}`, label: fam.name, colour: fam.colour, isFamily: true };
    }
    return { key: `ind:${tid}`, label: getName(tid), colour: getColour(tid), isFamily: false };
  }
  type FamilyAggRow = {
    fromKey: string; fromLabel: string; fromColour: string; fromIsFamily: boolean;
    toKey: string; toLabel: string; toColour: string; toIsFamily: boolean;
    totalAmount: number; settlements: Settlement[];
  };
  const familyAggMap: Record<string, FamilyAggRow> = {};
  for (const s of (settlements as Settlement[]).filter((s) => s.status === 'pending')) {
    const from = getFamilyKey(s.from_traveller);
    const to   = getFamilyKey(s.to_traveller);
    if (from.key === to.key) continue; // same family — skip internal debt
    const aggKey = `${from.key}→${to.key}`;
    if (!familyAggMap[aggKey]) {
      familyAggMap[aggKey] = {
        fromKey: from.key, fromLabel: from.label, fromColour: from.colour, fromIsFamily: from.isFamily,
        toKey: to.key,     toLabel: to.label,     toColour: to.colour,     toIsFamily: to.isFamily,
        totalAmount: 0, settlements: [],
      };
    }
    familyAggMap[aggKey].totalAmount += s.amount;
    familyAggMap[aggKey].settlements.push(s);
  }
  const familyAggRows = Object.values(familyAggMap);

  // ── budget helpers
  async function saveBudgets() {
    setSavingBudgets(true);
    try {
      const list = CATEGORIES.filter((c) => budgetInputs[c] && parseFloat(budgetInputs[c]) > 0)
        .map((c) => ({ category: c, amount: parseFloat(budgetInputs[c]), currency: homeCurrency }));
      await expensesApi.upsertBudgets(currentTrip!.id, { budgets: list });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['expenses', 'summary'] });
    } finally { setSavingBudgets(false); }
  }

  // ── derived data
  const filteredExpenses = expenseCat === 'all' ? expenses : expenses.filter((e) => e.category === expenseCat);
  const groupedExpenses  = groupByDate(filteredExpenses);
  const summaryMap: Record<string, { total_home: number; budget_amount: number | null; count: number }> = {};
  for (const s of expSummary) summaryMap[s.category] = { total_home: s.total_home, budget_amount: s.budget_amount, count: s.count };
  const totalSpent  = expSummary.reduce((s, r) => s + r.total_home, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const pendingSettlements = settlements.filter((s) => s.status === 'pending');
  const paidSettlements    = settlements.filter((s) => s.status === 'paid');
  const filteredDeposits   = depositStatusTab === 'all' ? deposits : deposits.filter((d) => d.status === depositStatusTab);
  const balanceMap: Record<string, number> = {};
  for (const s of pendingSettlements) {
    balanceMap[s.from_traveller] = (balanceMap[s.from_traveller] ?? 0) - s.amount;
    balanceMap[s.to_traveller]   = (balanceMap[s.to_traveller]   ?? 0) + s.amount;
  }
  const fromSym = CURRENCY_SYMBOLS[currFrom] || currFrom;
  const toSym   = CURRENCY_SYMBOLS[currTo]   || currTo;

  const timeSince = useCallback((dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }, []);

  if (!currentTrip) return null;

  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">Finance</h1>
          {totalSpent > 0 && (
            <p className="text-sm text-ink-faint">
              {fmt(totalSpent, homeCurrency)} spent
              {totalBudget > 0 && ` · ${fmt(totalBudget, homeCurrency)} budget`}
            </p>
          )}
        </div>
        {tab === 'expenses' && (
          <button className="btn-primary" onClick={() => navigate('/expenses/add')}>+ Add Expense</button>
        )}
        {tab === 'deposits' && isOrganiser && (
          <button className="btn-primary" onClick={() => navigate('/expenses/deposits/add')}>
            + Add Deposit
          </button>
        )}
        {tab === 'settlements' && isOrganiser && (
          <button className="btn-primary" onClick={() => setShowCalcConfirm(true)}>⚖️ Calculate</button>
        )}
        {tab === 'claims' && isOrganiser && (
          <button className="btn-primary" onClick={() => navigate('/expenses/claims/new')}>
            + Send for Group Review
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {MAIN_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? 'bg-navy text-white'
                : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
            }`}
          >
            {label}
            {key === 'claims' && pendingClaimCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-terracotta text-white
                                text-[10px] font-bold flex items-center justify-center leading-none">
                {pendingClaimCount > 9 ? '9+' : pendingClaimCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ TAB: EXPENSES ══════════════════════════════════════════════════════ */}
      {tab === 'expenses' && (
        <>
          {expSummary.length > 0 && (
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                <button
                  onClick={() => setExpenseCat('all')}
                  className={`flex flex-col items-center p-3 rounded-xl min-w-[80px] transition-colors ${
                    expenseCat === 'all' ? 'bg-navy text-white' : 'bg-white border border-parchment-dark hover:bg-parchment/60'
                  }`}
                >
                  <span className="text-xl">📋</span>
                  <span className="text-xs mt-1 font-medium">All</span>
                  <span className="text-xs opacity-70">{fmt(totalSpent, homeCurrency)}</span>
                </button>
                {CATEGORIES.filter((c) => summaryMap[c]).map((cat) => {
                  const s = summaryMap[cat];
                  const pct = s.budget_amount ? Math.min(100, (s.total_home / s.budget_amount) * 100) : null;
                  const over = pct !== null && pct >= 100;
                  return (
                    <button
                      key={cat}
                      onClick={() => setExpenseCat(cat)}
                      className={`flex flex-col items-center p-3 rounded-xl min-w-[80px] transition-colors ${
                        expenseCat === cat ? 'bg-navy text-white' : 'bg-white border border-parchment-dark hover:bg-parchment/60'
                      }`}
                    >
                      <span className="text-xl">{EXPENSE_CATEGORY_ICONS[cat]}</span>
                      <span className="text-xs mt-1 font-medium capitalize">{cat}</span>
                      <span className="text-xs opacity-70">{fmt(s.total_home, homeCurrency)}</span>
                      {pct !== null && (
                        <div className="progress-bar-track w-16 mt-1">
                          <div className="progress-bar-fill" style={{ width: `${pct}%`, backgroundColor: over ? '#EF4444' : undefined }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {expLoading ? (
            <p className="text-ink-faint text-center py-8">Loading expenses…</p>
          ) : filteredExpenses.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">💰</p>
              <p className="text-ink-faint">No expenses yet.</p>
              <button className="btn-primary mt-4" onClick={() => navigate('/expenses/add')}>Log first expense</button>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedExpenses.map(({ date, items }) => (
                <div key={date}>
                  <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2 px-1">{fmtDate(date)}</h2>
                  <div className="space-y-2">
                    {items.map((exp) => {
                      const paidBy = travellers.find((t) => t.id === exp.paid_by);
                      const mySplit = exp.splits.find((s) => s.traveller_id === activeTraveller?.id);
                      return (
                        <div key={exp.id} className="vintage-card p-4">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl shrink-0 mt-0.5">{EXPENSE_CATEGORY_ICONS[exp.category]}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-ink">{exp.description}</p>
                                  {paidBy && (
                                    <p className="text-xs text-ink-faint mt-0.5">
                                      Paid by{' '}
                                      <span className="font-medium" style={{ color: paidBy.avatar_colour }}>{paidBy.name}</span>
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  {exp.amount_home !== null ? (
                                    <>
                                      <p className="font-bold text-ink text-lg">{fmt(exp.amount_home, homeCurrency)}</p>
                                      {exp.currency !== homeCurrency && (
                                        <p className="text-xs text-ink-faint">{fmt(exp.amount, exp.currency)}</p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="font-bold text-ink text-lg">{fmt(exp.amount, exp.currency)}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="badge badge-gold text-xs capitalize">{exp.split_mode}</span>
                                {mySplit && (
                                  <span className="text-xs text-ink-faint">Your share: <strong>{fmt(mySplit.amount, exp.currency)}</strong></span>
                                )}
                                <span className="text-xs text-ink-faint">{exp.splits.length} {exp.splits.length === 1 ? 'person' : 'people'}</span>
                                {exp.receipt_filename && (
                                  <button onClick={() => setViewingReceipt(`${API_BASE}/expenses/${exp.id}/receipt`)}
                                    className="text-xs text-navy hover:underline flex items-center gap-0.5">
                                    📎 Receipt
                                  </button>
                                )}
                              </div>
                              {exp.notes && <p className="text-xs text-ink-faint mt-1 italic">{exp.notes}</p>}
                            </div>
                          </div>
                          {isOrganiser && (
                            <div className="flex gap-2 mt-3 justify-end">
                              <button onClick={() => navigate(`/expenses/${exp.id}/edit`)} className="btn-secondary text-xs py-1 px-3">Edit</button>
                              <button onClick={() => { if (confirm('Delete this expense?')) deleteExpenseMutation.mutate(exp.id); }} className="btn-danger text-xs py-1 px-3">Delete</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══ TAB: SETTLEMENTS ═══════════════════════════════════════════════════ */}
      {tab === 'settlements' && (
        <>
          {totalSpent > 0 && (
            <div className="vintage-card p-4 text-center">
              <p className="text-sm text-ink-faint">Total Group Spend</p>
              <p className="text-3xl font-bold text-navy mt-1">{fmt(totalSpent, homeCurrency)}</p>
            </div>
          )}
          {Object.keys(balanceMap).length > 0 && (
            <div className="vintage-card p-4">
              <h2 className="text-sm font-semibold text-ink-faint mb-3">Net Balances</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(balanceMap).map(([id, net]) => (
                  <div key={id} className={`rounded-xl p-3 text-center ${net >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white mb-1"
                      style={{ backgroundColor: getColour(id) }}>
                      {getName(id).charAt(0).toUpperCase()}
                    </span>
                    <p className="text-xs font-medium text-ink truncate">{getName(id)}</p>
                    <p className={`text-sm font-bold mt-0.5 ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {net >= 0 ? '+' : ''}{fmt(net, homeCurrency)}
                    </p>
                    <p className="text-xs text-ink-faint">{net >= 0 ? 'is owed' : 'owes'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {settLoading ? (
            <p className="text-ink-faint text-center py-8">Loading…</p>
          ) : pendingSettlements.length === 0 && paidSettlements.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">⚖️</p>
              <p className="text-ink-faint mb-2">No settlements calculated yet.</p>
              {isOrganiser && (
                <>
                  <p className="text-sm text-ink-faint mb-4">Add expenses first, then calculate who owes whom.</p>
                  <button className="btn-primary" onClick={() => setShowCalcConfirm(true)}>Calculate Settlements</button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Family view toggle — only shown when families exist */}
              {families.length > 0 && pendingSettlements.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-faint font-medium">View:</span>
                  <div className="flex rounded-lg border border-parchment-dark overflow-hidden">
                    <button
                      onClick={() => setFamilyView(false)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        !familyView ? 'bg-navy text-white' : 'bg-white text-ink hover:bg-parchment/60'
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      onClick={() => setFamilyView(true)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        familyView ? 'bg-navy text-white' : 'bg-white text-ink hover:bg-parchment/60'
                      }`}
                    >
                      By Family
                    </button>
                  </div>
                </div>
              )}

              {pendingSettlements.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">
                    Outstanding ({familyView ? familyAggRows.length : pendingSettlements.length})
                  </h2>

                  {familyView ? (
                    /* ── Family-grouped view ── */
                    <div className="space-y-2">
                      {familyAggRows.map((row) => {
                        const aggKey = `${row.fromKey}→${row.toKey}`;
                        const isExpanded = expandedFamilyGroups.has(aggKey);
                        const allPending = row.settlements.filter((s) => s.status === 'pending');
                        return (
                          <div key={aggKey} className="vintage-card overflow-hidden">
                            {/* Aggregated row */}
                            <div className="p-4 flex items-center gap-3">
                              <span
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
                                style={{ backgroundColor: row.fromColour }}
                              >
                                {row.fromLabel.charAt(0).toUpperCase()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-ink">
                                  <span className="font-semibold">{row.fromLabel}</span>
                                  {row.fromIsFamily && <span className="text-[10px] text-ink-faint ml-1">family</span>}
                                  <span className="text-ink/50 mx-2">pays</span>
                                  <span className="font-semibold">{row.toLabel}</span>
                                  {row.toIsFamily && <span className="text-[10px] text-ink-faint ml-1">family</span>}
                                </p>
                                <p className="text-lg font-bold text-navy">{fmt(row.totalAmount, homeCurrency)}</p>
                                {allPending.length > 1 && (
                                  <p className="text-[11px] text-ink-faint">{allPending.length} individual settlements</p>
                                )}
                              </div>
                              <span
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
                                style={{ backgroundColor: row.toColour }}
                              >
                                {row.toLabel.charAt(0).toUpperCase()}
                              </span>
                              <div className="flex flex-col gap-1 shrink-0">
                                {isOrganiser && (
                                  <button
                                    onClick={() => allPending.forEach((s) => markPaidMutation.mutate(s.id))}
                                    className="btn-secondary text-xs py-1 px-2"
                                  >
                                    ✓ Mark all paid
                                  </button>
                                )}
                                {allPending.length > 1 && (
                                  <button
                                    onClick={() => setExpandedFamilyGroups((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(aggKey)) next.delete(aggKey); else next.add(aggKey);
                                      return next;
                                    })}
                                    className="text-xs text-ink-faint hover:text-navy text-center"
                                  >
                                    {isExpanded ? '▲ Hide' : '▼ Expand'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Expanded individual settlements */}
                            {isExpanded && (
                              <div className="border-t border-parchment-dark bg-parchment/40 divide-y divide-parchment-dark">
                                {allPending.map((s) => (
                                  <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                                    <span
                                      className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                      style={{ backgroundColor: getColour(s.from_traveller) }}
                                    >
                                      {getName(s.from_traveller).charAt(0).toUpperCase()}
                                    </span>
                                    <span className="text-xs text-ink flex-1">
                                      <span className="font-medium">{getName(s.from_traveller)}</span>
                                      <span className="text-ink/40 mx-1">→</span>
                                      <span className="font-medium">{getName(s.to_traveller)}</span>
                                    </span>
                                    <span className="text-xs font-semibold text-navy">{fmt(s.amount, homeCurrency)}</span>
                                    {isOrganiser && (
                                      <button
                                        onClick={() => markPaidMutation.mutate(s.id)}
                                        className="text-xs text-ink-faint hover:text-navy ml-1"
                                      >
                                        ✓
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ── Individual view ── */
                    <div className="space-y-2">
                      {pendingSettlements.map((s) => (
                        <SettlementRow key={s.id} settlement={s} getName={getName} getColour={getColour}
                          isOrganiser={isOrganiser} homeCurrency={homeCurrency} onMarkPaid={() => markPaidMutation.mutate(s.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {paidSettlements.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">Completed ({paidSettlements.length})</h2>
                  <div className="space-y-2">
                    {paidSettlements.map((s) => (
                      <SettlementRow key={s.id} settlement={s} getName={getName} getColour={getColour}
                        isOrganiser={false} homeCurrency={homeCurrency} onMarkPaid={() => {}} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ TAB: DEPOSITS ══════════════════════════════════════════════════════ */}
      {tab === 'deposits' && (
        <>
          {depSummary && (
            <div className="grid grid-cols-3 gap-3">
              <div className="vintage-card text-center p-4">
                <p className="text-xs text-ink-faint mb-1">Pending</p>
                <p className="text-lg font-bold text-navy">{fmt(depSummary.total_pending_home, homeCurrency)}</p>
                <p className="text-xs text-ink-faint">{depSummary.count_pending} item{depSummary.count_pending !== 1 ? 's' : ''}</p>
              </div>
              <div className="vintage-card text-center p-4">
                <p className="text-xs text-ink-faint mb-1">Paid</p>
                <p className="text-lg font-bold text-green-700">{fmt(depSummary.total_paid_home, homeCurrency)}</p>
              </div>
              <div className="vintage-card text-center p-4">
                <p className="text-xs text-ink-faint mb-1">Overdue</p>
                <p className="text-lg font-bold text-terracotta">{fmt(depSummary.total_overdue_home, homeCurrency)}</p>
                <p className="text-xs text-ink-faint">{depSummary.count_overdue} item{depSummary.count_overdue !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DEPOSIT_STATUS_TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setDepositStatusTab(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  depositStatusTab === key ? 'bg-navy text-white' : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/50'
                }`}
              >{label}</button>
            ))}
          </div>
          {depLoading ? (
            <p className="text-ink-faint text-center py-8">Loading…</p>
          ) : filteredDeposits.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">🔖</p>
              <p className="text-ink-faint">No deposits yet.</p>
              {isOrganiser && (
                <button className="btn-primary mt-4" onClick={() => navigate('/expenses/deposits/add')}>
                  Add first deposit
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeposits.map((d) => (
                <div key={d.id} className="vintage-card p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-ink">{d.description}</p>
                      <span className={`badge ${depositStatusBadge(d.status)} text-xs px-2 py-0.5 rounded`}>{d.status}</span>
                      {d.linked_type && <span className="badge badge-navy text-xs">{d.linked_type}</span>}
                    </div>
                    <p className="text-lg font-bold text-navy">
                      {fmt(d.amount, d.currency)}
                      {d.amount_home !== null && d.currency !== homeCurrency && (
                        <span className="text-sm font-normal text-ink-faint ml-2">(~{fmt(d.amount_home, homeCurrency)})</span>
                      )}
                    </p>
                    {d.due_date && (
                      <p className="text-sm text-ink-faint mt-1">
                        Due: {parseLocalDate(d.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {d.notes && <p className="text-sm text-ink-faint mt-1 italic">{d.notes}</p>}
                  </div>
                  {isOrganiser && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {d.status !== 'paid' && (
                        <button onClick={() => depositStatusMutation.mutate({ id: d.id, status: 'paid' })} className="btn-secondary text-xs py-1 px-2">✓ Paid</button>
                      )}
                      {d.status === 'pending' && (
                        <button onClick={() => depositStatusMutation.mutate({ id: d.id, status: 'overdue' })} className="btn-danger text-xs py-1 px-2">Overdue</button>
                      )}
                      <button onClick={() => navigate(`/expenses/deposits/${d.id}/edit`)} className="btn-secondary text-xs py-1 px-2">Edit</button>
                      <button onClick={() => { if (confirm('Delete?')) deleteDepositMutation.mutate(d.id); }} className="btn-danger text-xs py-1 px-2">Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══ TAB: CURRENCY ══════════════════════════════════════════════════════ */}
      {tab === 'currency' && (
        <div className="max-w-lg mx-auto space-y-5">
          {rateInfo && (
            <div className="vintage-card p-4 text-center">
              <div className="font-display text-lg">
                1 {CURRENCY_SYMBOLS[homeCurrency] ?? homeCurrency} ={' '}
                <span className="font-bold text-navy">{rateInfo.rate.toFixed(4)}</span>{' '}
                {CURRENCY_SYMBOLS[destCurrency] ?? destCurrency}
              </div>
              <div className="text-xs text-ink-faint mt-1">Updated {timeSince(rateInfo.fetched_at)}</div>
            </div>
          )}
          <div className="vintage-card p-6 space-y-4">
            <div>
              <label className="block text-sm font-display text-ink-light mb-1">{currFrom}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-faint">{fromSym}</span>
                <input className="vintage-input pl-8 text-2xl font-display" type="number" min="0" step="0.01"
                  value={currAmount} onChange={(e) => setCurrAmount(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => setCurrDir((d) => d === 'home-to-dest' ? 'dest-to-home' : 'home-to-dest')}
                className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center text-lg hover:bg-navy-dark transition-colors"
              >⇅</button>
            </div>
            <div>
              <label className="block text-sm font-display text-ink-light mb-1">{currTo}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-faint">{toSym}</span>
                <div className="vintage-input pl-8 text-2xl font-display bg-parchment-dark/30 min-h-[3rem] flex items-center">
                  {conversion ? conversion.converted.toFixed(2) : '0.00'}
                </div>
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm font-display text-ink-light mb-2">Quick convert</p>
            <div className="flex gap-2 flex-wrap">
              {QUICK_AMOUNTS.map((amt) => (
                <button key={amt} onClick={() => setCurrAmount(String(amt))}
                  className={`px-4 py-2 rounded-lg font-display text-sm transition-all ${
                    currAmount === String(amt) ? 'bg-navy text-white' : 'bg-white border border-parchment-dark text-ink hover:bg-parchment/60'
                  }`}
                >{fromSym}{amt}</button>
              ))}
            </div>
          </div>
          <div className="vintage-card p-4">
            <h3 className="font-display text-sm font-semibold text-navy mb-3">Quick Reference</h3>
            <div className="space-y-1">
              {[5, 10, 20, 50, 100, 200, 500].map((amt) => {
                const rate = rateInfo?.rate || 0;
                return (
                  <div key={amt} className="flex justify-between text-sm py-1 border-b border-parchment-dark last:border-0">
                    <span>{CURRENCY_SYMBOLS[homeCurrency] ?? homeCurrency}{amt}</span>
                    <span className="font-mono text-ink-faint">{CURRENCY_SYMBOLS[destCurrency] ?? destCurrency}{(amt * rate).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: BUDGET ════════════════════════════════════════════════════════ */}
      {tab === 'budget' && (
        <div className="vintage-card p-6">
          <h2 className="text-lg font-display font-semibold text-navy mb-1">Category Budgets</h2>
          <p className="text-sm text-ink-faint mb-6">Set limits in {homeCurrency}. Leave blank for no limit.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {CATEGORIES.map((cat) => {
              const spent = summaryMap[cat]?.total_home ?? 0;
              const budgetAmt = budgetInputs[cat] ? parseFloat(budgetInputs[cat]) : null;
              const pct = budgetAmt ? Math.min(100, (spent / budgetAmt) * 100) : 0;
              const over = budgetAmt !== null && spent > budgetAmt;
              return (
                <div key={cat} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span>{EXPENSE_CATEGORY_ICONS[cat]}</span>
                    <span className="capitalize">{cat}</span>
                    <span className="text-xs text-ink-faint ml-auto">Spent: {fmt(spent, homeCurrency)}</span>
                  </label>
                  <input type="number" step="1" min="0" className="vintage-input w-full" placeholder="No limit"
                    value={budgetInputs[cat]}
                    onChange={(e) => setBudgetInputs((prev) => ({ ...prev, [cat]: e.target.value }))}
                    disabled={!isOrganiser} />
                  {budgetAmt !== null && budgetAmt > 0 && (
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${pct}%`, backgroundColor: over ? '#EF4444' : undefined }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {isOrganiser && (
            <button className="btn-primary" onClick={saveBudgets} disabled={savingBudgets}>
              {savingBudgets ? 'Saving…' : 'Save Budgets'}
            </button>
          )}
        </div>
      )}

      {/* ══ TAB: CLAIMS ═══════════════════════════════════════════════════════ */}
      {tab === 'claims' && (
        <div className="space-y-4">
          {/* CTA for anyone (including organiser) who still has claims to respond to */}
          {pendingClaimCount > 0 && (
            <div className="vintage-card p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-ink">
                  {pendingClaimCount} expense claim{pendingClaimCount !== 1 ? 's' : ''} need{pendingClaimCount === 1 ? 's' : ''} your response
                </p>
                <p className="text-xs text-ink-faint mt-0.5">Swipe to accept, split, or decline</p>
              </div>
              <button className="btn-primary shrink-0" onClick={() => navigate('/expenses/claims')}>
                Review Now
              </button>
            </div>
          )}

          {/* Claims list */}
          {allClaims.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-ink-faint mb-2">No claims yet.</p>
              {isOrganiser && (
                <>
                  <p className="text-sm text-ink-faint mb-4">
                    Use this when you're not sure who owes what — send it to the group to decide.
                  </p>
                  <button className="btn-primary" onClick={() => navigate('/expenses/claims/new')}>
                    Send first claim for review
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(allClaims as ExpenseClaim[]).map((claim) => {
                // A non-organiser can go to the swipe queue for any open claim
                // they didn't create — regardless of whether pendingClaims has
                // Whether this specific claim is still pending a response from the current user
                const needsMyResponse = pendingClaims.some((p) => p.id === claim.id);
                const canReview = claim.status === 'open';
                const isClickable = isOrganiser || canReview;
                return (
                  <div
                    key={claim.id}
                    className={`vintage-card p-4 ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                    onClick={() => {
                      if (isOrganiser) navigate(`/expenses/claims/${claim.id}`);
                      else if (canReview) navigate('/expenses/claims');
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0 mt-0.5">
                        {EXPENSE_CATEGORY_ICONS[claim.category]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-ink">{claim.description}</p>
                          <span className={`badge text-xs shrink-0 ${
                            claim.status === 'approved'   ? 'badge-green'
                            : claim.status === 'cancelled' ? 'badge-terracotta'
                            : 'badge-gold'
                          }`}>
                            {claim.status}
                          </span>
                        </div>
                        <p className="text-lg font-bold text-navy mt-0.5">
                          {new Intl.NumberFormat('en-GB', { style: 'currency', currency: claim.currency }).format(claim.total_amount)}
                        </p>
                        {/* Line items preview */}
                        {claim.line_items && claim.line_items.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {claim.line_items.slice(0, 3).map((li, i) => (
                              <div key={i} className="flex items-center justify-between text-xs text-ink-faint">
                                <span className="truncate mr-2">• {li.description}</span>
                                <span className="shrink-0 font-medium">
                                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: claim.currency }).format(li.amount)}
                                </span>
                              </div>
                            ))}
                            {claim.line_items.length > 3 && (
                              <p className="text-xs text-ink-faint">+ {claim.line_items.length - 3} more items</p>
                            )}
                          </div>
                        )}
                        {claim.status === 'open' && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-ink-faint mb-1">
                              <span>{claim.response_count ?? 0} of {claim.total_travellers ?? 0} responded</span>
                            </div>
                            <div className="progress-bar-track">
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${((claim.response_count ?? 0) / Math.max(1, claim.total_travellers ?? 1)) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                        {claim.created_by_name && (
                          <p className="text-xs text-ink-faint mt-1">Sent by {claim.created_by_name}</p>
                        )}
                      </div>
                    </div>
                    {/* Review CTA — shown for anyone who hasn't responded to this claim yet */}
                    {needsMyResponse && (
                      <div className="mt-3 pt-3 border-t border-parchment-dark flex items-center justify-between">
                        <p className="text-xs text-amber-700 font-medium">Tap to say what you owe</p>
                        <button
                          className="text-xs font-semibold text-navy hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigate('/expenses/claims'); }}
                        >
                          Review &amp; respond →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Calculate settlements confirmation */}
      {showCalcConfirm && (
        <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="vintage-card rounded-t-2xl sm:rounded-xl w-full max-w-sm text-center p-6">
            <p className="text-3xl mb-3">⚖️</p>
            <h2 className="text-xl font-display font-bold text-navy mb-2">Recalculate Settlements?</h2>
            <p className="text-sm text-ink-faint mb-6">
              Replaces all pending settlements with fresh calculations. Paid settlements are unaffected.
            </p>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={() => calculateMutation.mutate()}
                disabled={calculateMutation.isPending}>
                {calculateMutation.isPending ? 'Calculating…' : 'Calculate'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowCalcConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt viewer */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-[60] bg-ink/90 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setViewingReceipt(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-ink">Receipt</h3>
              <button onClick={() => setViewingReceipt(null)} className="text-2xl text-ink-faint hover:text-ink leading-none">×</button>
            </div>
            {viewingReceipt.endsWith('.pdf') ? (
              <a href={viewingReceipt} target="_blank" rel="noreferrer" className="btn-primary block text-center">Open PDF ↗</a>
            ) : (
              <img src={viewingReceipt} alt="Receipt" className="w-full rounded-xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
