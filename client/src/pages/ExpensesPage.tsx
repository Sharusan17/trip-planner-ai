import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { expensesApi } from '../api/expenses';
import { travellersApi } from '../api/travellers';
import type {
  Expense, ExpenseCategory, SplitMode,
  CreateExpenseInput,
} from '@trip-planner-ai/shared';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';

const CATEGORIES: ExpenseCategory[] = [
  'accommodation', 'food', 'transport', 'activities', 'shopping', 'other',
];

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal', label: 'Equal' },
  { key: 'weighted', label: 'By Weight' },
  { key: 'custom', label: 'Custom' },
];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface ExpenseFormData {
  description: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  expense_date: string;
  paid_by: string;
  split_mode: SplitMode;
  traveller_ids: string[];
  custom_splits: Record<string, string>;
  notes: string;
}

const makeEmptyForm = (defaultCurrency = 'EUR', defaultPaidBy = ''): ExpenseFormData => ({
  description: '',
  amount: '',
  currency: defaultCurrency,
  category: 'other',
  expense_date: new Date().toISOString().split('T')[0],
  paid_by: defaultPaidBy,
  split_mode: 'equal',
  traveller_ids: [],
  custom_splits: {},
  notes: '',
});

export default function ExpensesPage() {
  const { currentTrip, activeTraveller, isOrganiser } = useTrip();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'expenses' | 'budget'>('expenses');
  const [activeCategory, setActiveCategory] = useState<ExpenseCategory | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseFormData>(() =>
    makeEmptyForm(currentTrip?.dest_currency, activeTraveller?.id ?? '')
  );
  const [budgetInputs, setBudgetInputs] = useState<Record<ExpenseCategory, string>>({
    accommodation: '', food: '', transport: '', activities: '', shopping: '', other: '',
  });
  const [savingBudgets, setSavingBudgets] = useState(false);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', currentTrip?.id],
    queryFn: () => expensesApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['expenses', 'summary', currentTrip?.id],
    queryFn: () => expensesApi.summary(currentTrip!.id),
    enabled: !!currentTrip,
    staleTime: 30_000,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', currentTrip?.id],
    queryFn: () => expensesApi.getBudgets(currentTrip!.id),
    enabled: !!currentTrip,
  });

  useEffect(() => {
    if (budgets.length > 0) {
      const inputs: Record<string, string> = {};
      for (const b of budgets) inputs[b.category] = String(b.amount);
      setBudgetInputs((prev) => ({ ...prev, ...inputs }));
    }
  }, [budgets]);

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateExpenseInput) => expensesApi.create(currentTrip!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['expenses', 'summary', currentTrip?.id] });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateExpenseInput> }) =>
      expensesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['expenses', 'summary', currentTrip?.id] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['expenses', 'summary', currentTrip?.id] });
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditingExpense(null);
    setForm(makeEmptyForm(currentTrip?.dest_currency, activeTraveller?.id ?? ''));
  }

  function openEdit(e: Expense) {
    setEditingExpense(e);
    const customSplits: Record<string, string> = {};
    for (const s of e.splits) customSplits[s.traveller_id] = String(s.amount);
    setForm({
      description: e.description,
      amount: String(e.amount),
      currency: e.currency,
      category: e.category,
      expense_date: e.expense_date,
      paid_by: e.paid_by,
      split_mode: e.split_mode,
      traveller_ids: e.splits.map((s) => s.traveller_id),
      custom_splits: customSplits,
      notes: e.notes ?? '',
    });
    setShowForm(true);
  }

  function toggleTraveller(id: string) {
    setForm((f) => {
      const ids = f.traveller_ids.includes(id)
        ? f.traveller_ids.filter((t) => t !== id)
        : [...f.traveller_ids, id];
      return { ...f, traveller_ids: ids };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const customSplits: Record<string, number> = {};
    if (form.split_mode === 'custom') {
      for (const [id, v] of Object.entries(form.custom_splits)) {
        customSplits[id] = parseFloat(v) || 0;
      }
    }
    const data: CreateExpenseInput = {
      description: form.description,
      amount: parseFloat(form.amount),
      currency: form.currency,
      category: form.category,
      expense_date: form.expense_date,
      paid_by: form.paid_by,
      split_mode: form.split_mode,
      traveller_ids: form.traveller_ids.length > 0 ? form.traveller_ids : travellers.map((t) => t.id),
      custom_splits: form.split_mode === 'custom' ? customSplits : undefined,
      notes: form.notes || undefined,
    };
    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  async function saveBudgets() {
    setSavingBudgets(true);
    try {
      const budgetList = CATEGORIES
        .filter((c) => budgetInputs[c] && parseFloat(budgetInputs[c]) > 0)
        .map((c) => ({ category: c, amount: parseFloat(budgetInputs[c]), currency: currentTrip!.home_currency }));
      await expensesApi.upsertBudgets(currentTrip!.id, { budgets: budgetList });
      qc.invalidateQueries({ queryKey: ['budgets', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['expenses', 'summary', currentTrip?.id] });
    } finally {
      setSavingBudgets(false);
    }
  }

  const filtered = activeCategory === 'all'
    ? expenses
    : expenses.filter((e) => e.category === activeCategory);

  const grouped = groupByDate(filtered);

  const summaryMap: Record<string, { total_home: number; budget_amount: number | null; count: number }> = {};
  for (const s of summary) {
    summaryMap[s.category] = { total_home: s.total_home, budget_amount: s.budget_amount, count: s.count };
  }

  const totalSpent = summary.reduce((s, r) => s + r.total_home, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);

  if (!currentTrip) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-navy">Expenses</h1>
          {totalSpent > 0 && (
            <p className="text-sm text-ink/60">
              {formatCurrency(totalSpent, currentTrip.home_currency)} spent
              {totalBudget > 0 && ` of ${formatCurrency(totalBudget, currentTrip.home_currency)} budget`}
            </p>
          )}
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingExpense(null);
            setForm(makeEmptyForm(currentTrip.dest_currency, activeTraveller?.id ?? ''));
            setShowForm(true);
          }}
        >
          + Add Expense
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['expenses', 'budget'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-navy text-parchment' : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/50'
            }`}
          >
            {tab === 'expenses' ? '💰 Expenses' : '📊 Budget'}
          </button>
        ))}
      </div>

      {/* Expenses tab */}
      {activeTab === 'expenses' && (
        <>
          {/* Category summary bar */}
          {summary.length > 0 && (
            <div className="overflow-x-auto pb-2 mb-4">
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                <button
                  onClick={() => setActiveCategory('all')}
                  className={`flex flex-col items-center p-3 rounded-lg min-w-[80px] transition-colors ${
                    activeCategory === 'all'
                      ? 'bg-navy text-parchment'
                      : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                  }`}
                >
                  <span className="text-xl">📋</span>
                  <span className="text-xs mt-1 font-medium">All</span>
                  <span className="text-xs opacity-70">
                    {formatCurrency(totalSpent, currentTrip.home_currency)}
                  </span>
                </button>
                {CATEGORIES.filter((c) => summaryMap[c]).map((cat) => {
                  const s = summaryMap[cat];
                  const pct = s.budget_amount ? Math.min(100, (s.total_home / s.budget_amount) * 100) : null;
                  const overBudget = pct !== null && pct >= 100;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`flex flex-col items-center p-3 rounded-lg min-w-[80px] transition-colors ${
                        activeCategory === cat
                          ? 'bg-navy text-parchment'
                          : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                      }`}
                    >
                      <span className="text-xl">{EXPENSE_CATEGORY_ICONS[cat]}</span>
                      <span className="text-xs mt-1 font-medium capitalize">{cat}</span>
                      <span className="text-xs opacity-70">
                        {formatCurrency(s.total_home, currentTrip.home_currency)}
                      </span>
                      {pct !== null && (
                        <div className="progress-bar-track w-16 mt-1">
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: overBudget ? '#C65D3E' : '#2D6A4F',
                            }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expense list */}
          {isLoading ? (
            <p className="text-ink/50 text-center py-8">Loading expenses...</p>
          ) : filtered.length === 0 ? (
            <div className="vintage-card text-center py-12">
              <p className="text-3xl mb-2">💰</p>
              <p className="text-ink/60">No expenses yet.</p>
              <button
                className="btn-primary mt-4"
                onClick={() => {
                  setEditingExpense(null);
                  setForm(makeEmptyForm(currentTrip.dest_currency, activeTraveller?.id ?? ''));
                  setShowForm(true);
                }}
              >
                Log first expense
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ date, items }) => (
                <div key={date}>
                  <h2 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2 px-1">
                    {formatDate(date)}
                  </h2>
                  <div className="space-y-2">
                    {items.map((exp) => {
                      const paidByTraveller = travellers.find((t) => t.id === exp.paid_by);
                      const mySplit = exp.splits.find((s) => s.traveller_id === activeTraveller?.id);
                      return (
                        <div key={exp.id} className="vintage-card p-4">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl shrink-0 mt-0.5">
                              {EXPENSE_CATEGORY_ICONS[exp.category]}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-ink">{exp.description}</p>
                                  {paidByTraveller && (
                                    <p className="text-xs text-ink/60 mt-0.5">
                                      Paid by{' '}
                                      <span
                                        className="font-medium"
                                        style={{ color: paidByTraveller.avatar_colour }}
                                      >
                                        {paidByTraveller.name}
                                      </span>
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-bold text-navy text-lg">
                                    {formatCurrency(exp.amount, exp.currency)}
                                  </p>
                                  {exp.amount_home !== null && exp.currency !== currentTrip.home_currency && (
                                    <p className="text-xs text-ink/40">
                                      ~{formatCurrency(exp.amount_home, currentTrip.home_currency)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Split info */}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="badge badge-gold text-xs capitalize">{exp.split_mode}</span>
                                {mySplit && (
                                  <span className="text-xs text-ink/60">
                                    Your share: <strong>{formatCurrency(mySplit.amount, exp.currency)}</strong>
                                  </span>
                                )}
                                <span className="text-xs text-ink/40">
                                  {exp.splits.length} {exp.splits.length === 1 ? 'person' : 'people'}
                                </span>
                              </div>

                              {exp.notes && <p className="text-xs text-ink/40 mt-1 italic">{exp.notes}</p>}
                            </div>
                          </div>

                          {isOrganiser && (
                            <div className="flex gap-2 mt-3 justify-end">
                              <button onClick={() => openEdit(exp)} className="btn-secondary text-xs py-1 px-3">
                                Edit
                              </button>
                              <button
                                onClick={() => { if (confirm('Delete this expense?')) deleteMutation.mutate(exp.id); }}
                                className="btn-danger text-xs py-1 px-3"
                              >
                                Delete
                              </button>
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

      {/* Budget tab */}
      {activeTab === 'budget' && (
        <div className="vintage-card p-6">
          <h2 className="text-lg font-display font-semibold text-navy mb-4">Category Budgets</h2>
          <p className="text-sm text-ink/60 mb-6">
            Set budgets in {currentTrip.home_currency}. Leave blank for no budget limit.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {CATEGORIES.map((cat) => {
              const spent = summaryMap[cat]?.total_home ?? 0;
              const budgetAmt = budgetInputs[cat] ? parseFloat(budgetInputs[cat]) : null;
              const pct = budgetAmt ? Math.min(100, (spent / budgetAmt) * 100) : 0;
              const overBudget = budgetAmt !== null && spent > budgetAmt;
              return (
                <div key={cat} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span>{EXPENSE_CATEGORY_ICONS[cat]}</span>
                    <span className="capitalize">{cat}</span>
                    <span className="text-xs text-ink/50 ml-auto">
                      Spent: {formatCurrency(spent, currentTrip.home_currency)}
                    </span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="vintage-input w-full"
                    placeholder="No limit"
                    value={budgetInputs[cat]}
                    onChange={(e) => setBudgetInputs((prev) => ({ ...prev, [cat]: e.target.value }))}
                    disabled={!isOrganiser}
                  />
                  {budgetAmt !== null && budgetAmt > 0 && (
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: overBudget ? '#C65D3E' : '#2D6A4F',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {isOrganiser && (
            <button
              className="btn-primary"
              onClick={saveBudgets}
              disabled={savingBudgets}
            >
              {savingBudgets ? 'Saving...' : 'Save Budgets'}
            </button>
          )}
        </div>
      )}

      {/* Add/Edit expense modal */}
      {showForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="vintage-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editingExpense ? 'Edit Expense' : 'Log Expense'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Description *</label>
                <input className="vintage-input w-full" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>

              {/* Amount + currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-ink mb-1">Amount *</label>
                  <input type="number" step="0.01" min="0" className="vintage-input w-full"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Currency</label>
                  <input className="vintage-input w-full uppercase" maxLength={3}
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                </div>
              </div>

              {/* Category picker */}
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} type="button"
                      onClick={() => setForm({ ...form, category: cat })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.category === cat
                          ? 'bg-navy text-parchment'
                          : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                      }`}
                    >
                      {EXPENSE_CATEGORY_ICONS[cat]}
                      <span className="capitalize">{cat}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + paid by */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Date *</label>
                  <input type="date" className="vintage-input w-full" value={form.expense_date}
                    onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Paid by *</label>
                  <select className="vintage-input w-full" value={form.paid_by}
                    onChange={(e) => setForm({ ...form, paid_by: e.target.value })} required>
                    <option value="">Select...</option>
                    {travellers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Split mode */}
              <div>
                <label className="block text-sm font-medium text-ink mb-2">Split Mode</label>
                <div className="flex gap-2">
                  {SPLIT_MODES.map(({ key, label }) => (
                    <button key={key} type="button"
                      onClick={() => setForm({ ...form, split_mode: key })}
                      className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                        form.split_mode === key
                          ? 'bg-navy text-parchment'
                          : 'bg-parchment-dark/20 hover:bg-parchment-dark/40'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Traveller selection */}
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Split Between {form.traveller_ids.length === 0 ? '(all)' : `(${form.traveller_ids.length})`}
                </label>
                <div className="space-y-1.5">
                  {travellers.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-navy"
                        checked={form.traveller_ids.includes(t.id)}
                        onChange={() => toggleTraveller(t.id)} />
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: t.avatar_colour }}
                      >
                        {t.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm text-ink flex-1">{t.name}</span>
                      {form.split_mode === 'custom' && form.traveller_ids.includes(t.id) && (
                        <input
                          type="number" step="0.01" min="0"
                          className="vintage-input w-24 text-sm"
                          placeholder="Amount"
                          value={form.custom_splits[t.id] ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              custom_splits: { ...f.custom_splits, [t.id]: e.target.value },
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      {form.split_mode === 'weighted' && (
                        <span className="text-xs text-ink/40">×{t.cost_split_weight}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea className="vintage-input w-full" rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingExpense ? 'Save Changes' : 'Log Expense'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
