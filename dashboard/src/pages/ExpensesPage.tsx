import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { expensesApi } from '../api/expenses';
import type { ExpenseLineItem } from '@trip-planner-ai/shared';
import { travellersApi } from '../api/travellers';
import { settlementsApi } from '../api/settlements';
import { depositsApi } from '../api/deposits';
import { currencyApi } from '../api/currency';
import type {
  Expense, ExpenseCategory, SplitMode, CreateExpenseInput,
  Settlement, Deposit, DepositStatus, CreateDepositInput,
} from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';

// ─── constants ───────────────────────────────────────────────────────────────

type MainTab = 'expenses' | 'settlements' | 'deposits' | 'currency' | 'budget';

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'expenses',    label: 'Expenses'    },
  { key: 'settlements', label: 'Settlements' },
  { key: 'deposits',    label: 'Deposits'    },
  { key: 'currency',    label: 'Currency'    },
  { key: 'budget',      label: 'Budget'      },
];

const CATEGORIES: ExpenseCategory[] = [
  'accommodation', 'food', 'transport', 'activities', 'shopping', 'other',
];

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal',    label: 'Equal'     },
  { key: 'weighted', label: 'By Weight' },
  { key: 'custom',   label: 'Custom'    },
  { key: 'itemised', label: 'Itemised'  },
];

const DEPOSIT_STATUS_TABS: { key: 'all' | DepositStatus; label: string }[] = [
  { key: 'all',     label: 'All'     },
  { key: 'pending', label: 'Pending' },
  { key: 'paid',    label: 'Paid'    },
  { key: 'overdue', label: 'Overdue' },
];

const LINKED_TYPES = ['accommodation', 'transport', 'activity', 'other'] as const;
const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };
const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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

// ─── expense form ─────────────────────────────────────────────────────────────

interface ExpenseFormData {
  description: string; amount: string; currency: string;
  category: ExpenseCategory; expense_date: string; paid_by: string;
  split_mode: SplitMode; traveller_ids: string[];
  custom_splits: Record<string, string>; notes: string;
}

const makeEmptyExpenseForm = (defaultCurrency = 'EUR', defaultPaidBy = ''): ExpenseFormData => ({
  description: '', amount: '', currency: defaultCurrency, category: 'other',
  expense_date: new Date().toISOString().split('T')[0],
  paid_by: defaultPaidBy, split_mode: 'equal', traveller_ids: [], custom_splits: {}, notes: '',
});

// ─── deposit form ─────────────────────────────────────────────────────────────

interface DepositFormData {
  description: string; amount: string; currency: string;
  due_date: string; linked_type: string; notes: string;
}
const emptyDepositForm: DepositFormData = {
  description: '', amount: '', currency: 'EUR', due_date: '', linked_type: '', notes: '',
};

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
  const qc = useQueryClient();

  // ── tab state
  const [tab, setTab] = useState<MainTab>('expenses');

  // ── expenses state
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory | 'all'>('all');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormData>(() =>
    makeEmptyExpenseForm(currentTrip?.dest_currency, activeTraveller?.id ?? '')
  );
  // line items for itemised split
  const [lineItems, setLineItems] = useState<Array<{ description: string; amount: string; traveller_ids: string[] }>>([
    { description: '', amount: '', traveller_ids: [] },
  ]);
  // receipt upload
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [budgetInputs, setBudgetInputs] = useState<Record<ExpenseCategory, string>>({
    accommodation: '', food: '', transport: '', activities: '', shopping: '', other: '',
  });
  const [savingBudgets, setSavingBudgets] = useState(false);

  // ── settlements state
  const [showCalcConfirm, setShowCalcConfirm] = useState(false);

  // ── deposits state
  const [depositStatusTab, setDepositStatusTab] = useState<'all' | DepositStatus>('all');
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [depositForm, setDepositForm] = useState<DepositFormData>(emptyDepositForm);

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
  const createExpenseMutation = useMutation({
    mutationFn: async (data: CreateExpenseInput) => {
      const expense = await expensesApi.create(currentTrip!.id, data);
      if (receiptFile) await expensesApi.uploadReceipt(expense.id, receiptFile).catch(() => {});
      return expense;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      closeExpenseForm();
    },
  });
  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateExpenseInput> }) => {
      const expense = await expensesApi.update(id, data);
      if (receiptFile) await expensesApi.uploadReceipt(id, receiptFile).catch(() => {});
      return expense;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); closeExpenseForm(); },
  });
  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
  const deleteReceiptMutation = useMutation({
    mutationFn: (id: string) => expensesApi.deleteReceipt(id),
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
  const createDepositMutation = useMutation({
    mutationFn: (data: CreateDepositInput) => depositsApi.create(currentTrip!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposits'] }); closeDepositForm(); },
  });
  const updateDepositMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateDepositInput> }) =>
      depositsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposits'] }); closeDepositForm(); },
  });
  const depositStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DepositStatus }) =>
      depositsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deposits'] }),
  });
  const deleteDepositMutation = useMutation({
    mutationFn: (id: string) => depositsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deposits'] }),
  });

  // ── line-item helpers
  function addLineItem() {
    setLineItems((prev) => [...prev, { description: '', amount: '', traveller_ids: [] }]);
  }
  function removeLineItem(i: number) {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLineItem(i: number, field: 'description' | 'amount', value: string) {
    setLineItems((prev) => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n; });
  }
  function toggleLineItemTraveller(i: number, tid: string) {
    setLineItems((prev) => {
      const n = [...prev];
      const ids = n[i].traveller_ids;
      n[i] = { ...n[i], traveller_ids: ids.includes(tid) ? ids.filter((x) => x !== tid) : [...ids, tid] };
      return n;
    });
  }
  // Compute per-traveller totals from line items
  function computeItemisedSplits(): Record<string, number> {
    const splits: Record<string, number> = {};
    for (const item of lineItems) {
      const amt = parseFloat(item.amount) || 0;
      if (amt <= 0 || item.traveller_ids.length === 0) continue;
      const share = amt / item.traveller_ids.length;
      for (const tid of item.traveller_ids) splits[tid] = (splits[tid] ?? 0) + share;
    }
    return splits;
  }

  // ── expense helpers
  function closeExpenseForm() {
    setShowExpenseForm(false);
    setEditingExpense(null);
    setExpenseForm(makeEmptyExpenseForm(currentTrip?.dest_currency, activeTraveller?.id ?? ''));
    setLineItems([{ description: '', amount: '', traveller_ids: [] }]);
    setReceiptFile(null);
    setReceiptPreview(null);
  }
  function openEditExpense(e: Expense) {
    setEditingExpense(e);
    const cs: Record<string, string> = {};
    for (const s of e.splits) cs[s.traveller_id] = String(s.amount);
    setExpenseForm({
      description: e.description, amount: String(e.amount), currency: e.currency,
      category: e.category, expense_date: e.expense_date, paid_by: e.paid_by,
      split_mode: e.split_mode, traveller_ids: e.splits.map((s) => s.traveller_id),
      custom_splits: cs, notes: e.notes ?? '',
    });
    if (e.split_mode === 'itemised' && e.line_items?.length) {
      setLineItems(e.line_items.map((li) => ({
        description: li.description, amount: String(li.amount), traveller_ids: li.traveller_ids,
      })));
    } else {
      setLineItems([{ description: '', amount: '', traveller_ids: [] }]);
    }
    setReceiptFile(null);
    setReceiptPreview(null);
    setShowExpenseForm(true);
  }
  function toggleTraveller(id: string) {
    setExpenseForm((f) => ({
      ...f,
      traveller_ids: f.traveller_ids.includes(id)
        ? f.traveller_ids.filter((t) => t !== id)
        : [...f.traveller_ids, id],
    }));
  }
  function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (expenseForm.split_mode === 'itemised') {
      const computedSplits = computeItemisedSplits();
      const validLineItems: ExpenseLineItem[] = lineItems
        .filter(li => li.description.trim() && parseFloat(li.amount) > 0)
        .map(li => ({ description: li.description, amount: parseFloat(li.amount), traveller_ids: li.traveller_ids }));
      const data: CreateExpenseInput = {
        description: expenseForm.description, amount: parseFloat(expenseForm.amount),
        currency: expenseForm.currency, category: expenseForm.category,
        expense_date: expenseForm.expense_date, paid_by: expenseForm.paid_by,
        split_mode: 'itemised',
        traveller_ids: Object.keys(computedSplits).length > 0 ? Object.keys(computedSplits) : travellers.map(t => t.id),
        custom_splits: computedSplits,
        line_items: validLineItems,
        notes: expenseForm.notes || undefined,
      };
      if (editingExpense) updateExpenseMutation.mutate({ id: editingExpense.id, data });
      else createExpenseMutation.mutate(data);
      return;
    }

    const cs: Record<string, number> = {};
    if (expenseForm.split_mode === 'custom') {
      for (const [id, v] of Object.entries(expenseForm.custom_splits)) cs[id] = parseFloat(v) || 0;
    }
    const data: CreateExpenseInput = {
      description: expenseForm.description, amount: parseFloat(expenseForm.amount),
      currency: expenseForm.currency, category: expenseForm.category,
      expense_date: expenseForm.expense_date, paid_by: expenseForm.paid_by,
      split_mode: expenseForm.split_mode,
      traveller_ids: expenseForm.traveller_ids.length > 0 ? expenseForm.traveller_ids : travellers.map((t) => t.id),
      custom_splits: expenseForm.split_mode === 'custom' ? cs : undefined,
      notes: expenseForm.notes || undefined,
    };
    if (editingExpense) updateExpenseMutation.mutate({ id: editingExpense.id, data });
    else createExpenseMutation.mutate(data);
  }

  // ── deposit helpers
  function closeDepositForm() {
    setShowDepositForm(false);
    setEditingDeposit(null);
    setDepositForm(emptyDepositForm);
  }
  function openEditDeposit(d: Deposit) {
    setEditingDeposit(d);
    setDepositForm({
      description: d.description, amount: String(d.amount), currency: d.currency,
      due_date: d.due_date ?? '', linked_type: d.linked_type ?? '', notes: d.notes ?? '',
    });
    setShowDepositForm(true);
  }
  function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateDepositInput = {
      description: depositForm.description, amount: parseFloat(depositForm.amount),
      currency: depositForm.currency, due_date: depositForm.due_date || undefined,
      linked_type: (depositForm.linked_type as CreateDepositInput['linked_type']) || undefined,
      notes: depositForm.notes || undefined,
    };
    if (editingDeposit) updateDepositMutation.mutate({ id: editingDeposit.id, data });
    else createDepositMutation.mutate(data);
  }

  // ── settlement helpers
  const getName   = (id: string) => travellers.find((t) => t.id === id)?.name ?? 'Unknown';
  const getColour = (id: string) => travellers.find((t) => t.id === id)?.avatar_colour ?? '#2563EB';

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
          <button className="btn-primary" onClick={() => {
            setEditingExpense(null);
            setExpenseForm(makeEmptyExpenseForm(currentTrip.dest_currency, activeTraveller?.id ?? ''));
            setShowExpenseForm(true);
          }}>+ Add Expense</button>
        )}
        {tab === 'deposits' && isOrganiser && (
          <button className="btn-primary" onClick={() => { setEditingDeposit(null); setDepositForm(emptyDepositForm); setShowDepositForm(true); }}>
            + Add Deposit
          </button>
        )}
        {tab === 'settlements' && isOrganiser && (
          <button className="btn-primary" onClick={() => setShowCalcConfirm(true)}>⚖️ Calculate</button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {MAIN_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? 'bg-navy text-white'
                : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
            }`}
          >
            {label}
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
              <button className="btn-primary mt-4" onClick={() => {
                setEditingExpense(null);
                setExpenseForm(makeEmptyExpenseForm(currentTrip.dest_currency, activeTraveller?.id ?? ''));
                setShowExpenseForm(true);
              }}>Log first expense</button>
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
                                  <p className="font-bold text-navy text-lg">{fmt(exp.amount, exp.currency)}</p>
                                  {exp.amount_home !== null && exp.currency !== homeCurrency && (
                                    <p className="text-xs text-ink-faint">~{fmt(exp.amount_home, homeCurrency)}</p>
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
                                  <button onClick={() => setViewingReceipt(`/uploads/receipts/${exp.receipt_filename!}`)}
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
                              <button onClick={() => openEditExpense(exp)} className="btn-secondary text-xs py-1 px-3">Edit</button>
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
              {pendingSettlements.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">Outstanding ({pendingSettlements.length})</h2>
                  <div className="space-y-2">
                    {pendingSettlements.map((s) => (
                      <SettlementRow key={s.id} settlement={s} getName={getName} getColour={getColour}
                        isOrganiser={isOrganiser} homeCurrency={homeCurrency} onMarkPaid={() => markPaidMutation.mutate(s.id)} />
                    ))}
                  </div>
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
                <button className="btn-primary mt-4" onClick={() => { setEditingDeposit(null); setDepositForm(emptyDepositForm); setShowDepositForm(true); }}>
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
                        Due: {new Date(d.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                      <button onClick={() => openEditDeposit(d)} className="btn-secondary text-xs py-1 px-2">Edit</button>
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

      {/* ══ MODALS ══════════════════════════════════════════════════════════════ */}

      {/* Expense form modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl border border-parchment-dark shadow-[var(--shadow-elevated)] w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editingExpense ? 'Edit Expense' : 'Log Expense'}
            </h2>
            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Description *</label>
                <input className="vintage-input w-full" value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-ink mb-1">Amount *</label>
                  <input type="number" step="0.01" min="0" className="vintage-input w-full"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Currency</label>
                  <input className="vintage-input w-full uppercase" maxLength={3}
                    value={expenseForm.currency}
                    onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} type="button"
                      onClick={() => setExpenseForm({ ...expenseForm, category: cat })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                        expenseForm.category === cat ? 'bg-navy text-white' : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                      }`}
                    >{EXPENSE_CATEGORY_ICONS[cat]} <span className="capitalize">{cat}</span></button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Date *</label>
                  <input type="date" className="vintage-input w-full" value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Paid by *</label>
                  <select className="vintage-input w-full" value={expenseForm.paid_by}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paid_by: e.target.value })} required>
                    <option value="">Select…</option>
                    {travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Split Mode</label>
                <div className="grid grid-cols-4 gap-2">
                  {SPLIT_MODES.map(({ key, label }) => (
                    <button key={key} type="button"
                      onClick={() => setExpenseForm({ ...expenseForm, split_mode: key })}
                      className={`py-1.5 rounded text-sm font-medium transition-colors ${
                        expenseForm.split_mode === key ? 'bg-navy text-white' : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>
              {expenseForm.split_mode === 'itemised' ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-ink">Line Items</label>
                    <button type="button" onClick={addLineItem} className="text-xs text-navy hover:underline font-medium">+ Add item</button>
                  </div>
                  <div className="space-y-3">
                    {lineItems.map((item, i) => (
                      <div key={i} className="border border-parchment-dark rounded-xl p-3 space-y-2">
                        <div className="flex gap-2 items-center">
                          <input className="vintage-input flex-1 text-sm" placeholder="Item (e.g. Burger)"
                            value={item.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} />
                          <input type="number" step="0.01" min="0" className="vintage-input w-24 text-sm text-right" placeholder="0.00"
                            value={item.amount} onChange={(e) => updateLineItem(i, 'amount', e.target.value)} />
                          {lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLineItem(i)}
                              className="text-terracotta text-xl leading-none flex-shrink-0 hover:opacity-70">×</button>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-ink-faint mb-1.5">Who had this?</p>
                          <div className="flex flex-wrap gap-1.5">
                            {travellers.map((t) => (
                              <button key={t.id} type="button" onClick={() => toggleLineItemTraveller(i, t.id)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                                  item.traveller_ids.includes(t.id) ? 'bg-navy text-white' : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/60'
                                }`}>
                                <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0"
                                  style={{ backgroundColor: t.avatar_colour }}>
                                  {t.name.charAt(0).toUpperCase()}
                                </span>
                                {t.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const splits = computeItemisedSplits();
                    return Object.keys(splits).length > 0 ? (
                      <div className="mt-3 bg-parchment/60 rounded-xl p-3">
                        <p className="text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wide">Split Preview</p>
                        <div className="space-y-1">
                          {Object.entries(splits).map(([tid, amt]) => (
                            <div key={tid} className="flex items-center justify-between text-sm">
                              <span className="text-ink">{getName(tid)}</span>
                              <span className="font-semibold text-navy">{fmt(amt, expenseForm.currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    Split Between {expenseForm.traveller_ids.length === 0 ? '(all)' : `(${expenseForm.traveller_ids.length})`}
                  </label>
                  <div className="space-y-1.5">
                    {travellers.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="accent-navy"
                          checked={expenseForm.traveller_ids.includes(t.id)}
                          onChange={() => toggleTraveller(t.id)} />
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: t.avatar_colour }}>{t.name.charAt(0).toUpperCase()}</span>
                        <span className="text-sm text-ink flex-1">{t.name}</span>
                        {expenseForm.split_mode === 'custom' && expenseForm.traveller_ids.includes(t.id) && (
                          <input type="number" step="0.01" min="0" className="vintage-input w-24 text-sm" placeholder="Amount"
                            value={expenseForm.custom_splits[t.id] ?? ''}
                            onChange={(e) => setExpenseForm((f) => ({ ...f, custom_splits: { ...f.custom_splits, [t.id]: e.target.value } }))}
                            onClick={(e) => e.stopPropagation()} />
                        )}
                        {expenseForm.split_mode === 'weighted' && (
                          <span className="text-xs text-ink-faint">×{t.cost_split_weight}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea className="vintage-input w-full" rows={2} value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
              </div>

              {/* Receipt upload */}
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Receipt (optional)</label>
                <input ref={receiptInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setReceiptFile(f);
                    setReceiptPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
                  }} />
                {receiptFile ? (
                  receiptPreview ? (
                    <div className="relative rounded-xl overflow-hidden">
                      <img src={receiptPreview} alt="Receipt preview" className="w-full h-32 object-cover" />
                      <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                        className="absolute top-2 right-2 w-6 h-6 bg-ink/60 text-white rounded-full flex items-center justify-center text-sm hover:bg-ink">
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-parchment/50 rounded-xl border border-parchment-dark text-sm">
                      <span className="text-ink flex-1 truncate">{receiptFile.name}</span>
                      <button type="button" onClick={() => setReceiptFile(null)} className="text-terracotta hover:underline text-xs shrink-0">Remove</button>
                    </div>
                  )
                ) : editingExpense?.receipt_filename ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setViewingReceipt(`/uploads/receipts/${editingExpense.receipt_filename}`)}
                      className="btn-secondary text-xs py-1.5 px-3">📎 View current receipt</button>
                    <button type="button" onClick={() => receiptInputRef.current?.click()} className="btn-secondary text-xs py-1.5 px-3">Replace</button>
                    {isOrganiser && (
                      <button type="button" onClick={() => deleteReceiptMutation.mutate(editingExpense.id)}
                        className="text-terracotta text-xs hover:underline">Remove</button>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => receiptInputRef.current?.click()}
                    className="btn-secondary text-sm w-full flex items-center justify-center py-2.5">📎 Attach receipt</button>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending}>
                  {editingExpense ? 'Save Changes' : 'Log Expense'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeExpenseForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit form modal */}
      {showDepositForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl border border-parchment-dark shadow-[var(--shadow-elevated)] w-full max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editingDeposit ? 'Edit Deposit' : 'Add Deposit'}
            </h2>
            <form onSubmit={handleDepositSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Description *</label>
                <input className="vintage-input w-full" value={depositForm.description}
                  onChange={(e) => setDepositForm({ ...depositForm, description: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Amount *</label>
                  <input type="number" step="0.01" min="0" className="vintage-input w-full"
                    value={depositForm.amount}
                    onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Currency</label>
                  <input className="vintage-input w-full uppercase" maxLength={3}
                    value={depositForm.currency}
                    onChange={(e) => setDepositForm({ ...depositForm, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Due Date</label>
                <input type="date" className="vintage-input w-full" value={depositForm.due_date}
                  onChange={(e) => setDepositForm({ ...depositForm, due_date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Category</label>
                <select className="vintage-input w-full" value={depositForm.linked_type}
                  onChange={(e) => setDepositForm({ ...depositForm, linked_type: e.target.value })}>
                  <option value="">None</option>
                  {LINKED_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea className="vintage-input w-full" rows={2} value={depositForm.notes}
                  onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createDepositMutation.isPending || updateDepositMutation.isPending}>
                  {editingDeposit ? 'Save Changes' : 'Add Deposit'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeDepositForm}>Cancel</button>
              </div>
            </form>
          </div>
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
