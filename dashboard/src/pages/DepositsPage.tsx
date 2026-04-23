import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '../context/TripContext';
import { depositsApi } from '../api/deposits';
import type { Deposit, DepositStatus, CreateDepositInput } from '@trip-planner-ai/shared';
import { parseLocalDate } from '@/utils/date';

const STATUS_TABS: { key: 'all' | DepositStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
];

const LINKED_TYPES = ['accommodation', 'transport', 'activity', 'other'] as const;

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function statusBadgeClass(status: DepositStatus) {
  if (status === 'paid') return 'status-badge-paid';
  if (status === 'overdue') return 'status-badge-overdue';
  return 'status-badge-pending';
}

interface DepositFormData {
  description: string;
  amount: string;
  currency: string;
  due_date: string;
  linked_type: string;
  notes: string;
}

const emptyForm: DepositFormData = {
  description: '', amount: '', currency: 'EUR',
  due_date: '', linked_type: '', notes: '',
};

export default function DepositsPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | DepositStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [form, setForm] = useState<DepositFormData>(emptyForm);

  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ['deposits', currentTrip?.id],
    queryFn: () => depositsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: summary } = useQuery({
    queryKey: ['deposits', 'summary', currentTrip?.id],
    queryFn: () => depositsApi.summary(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateDepositInput) => depositsApi.create(currentTrip!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['deposits', 'summary', currentTrip?.id] });
      setShowForm(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateDepositInput> }) =>
      depositsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['deposits', 'summary', currentTrip?.id] });
      setShowForm(false);
      setEditingDeposit(null);
      setForm(emptyForm);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DepositStatus }) =>
      depositsApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['deposits', 'summary', currentTrip?.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => depositsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits', currentTrip?.id] });
      qc.invalidateQueries({ queryKey: ['deposits', 'summary', currentTrip?.id] });
    },
  });

  const filtered = activeTab === 'all' ? deposits : deposits.filter((d) => d.status === activeTab);

  function openEdit(d: Deposit) {
    setEditingDeposit(d);
    setForm({
      description: d.description,
      amount: String(d.amount),
      currency: d.currency,
      due_date: d.due_date ?? '',
      linked_type: d.linked_type ?? '',
      notes: d.notes ?? '',
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateDepositInput = {
      description: form.description,
      amount: parseFloat(form.amount),
      currency: form.currency,
      due_date: form.due_date || undefined,
      linked_type: (form.linked_type as CreateDepositInput['linked_type']) || undefined,
      notes: form.notes || undefined,
    };
    if (editingDeposit) {
      updateMutation.mutate({ id: editingDeposit.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  if (!currentTrip) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-navy">Deposits & Payments</h1>
        {isOrganiser && (
          <button
            className="btn-primary"
            onClick={() => { setEditingDeposit(null); setForm(emptyForm); setShowForm(true); }}
          >
            + Add Deposit
          </button>
        )}
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="vintage-card text-center p-4">
            <p className="text-xs text-ink/60 mb-1">Pending</p>
            <p className="text-lg font-bold text-navy">
              {formatCurrency(summary.total_pending_home, currentTrip.home_currency)}
            </p>
            <p className="text-xs text-ink/50">{summary.count_pending} item{summary.count_pending !== 1 ? 's' : ''}</p>
          </div>
          <div className="vintage-card text-center p-4">
            <p className="text-xs text-ink/60 mb-1">Paid</p>
            <p className="text-lg font-bold" style={{ color: '#2D6A4F' }}>
              {formatCurrency(summary.total_paid_home, currentTrip.home_currency)}
            </p>
          </div>
          <div className="vintage-card text-center p-4">
            <p className="text-xs text-ink/60 mb-1">Overdue</p>
            <p className="text-lg font-bold text-terracotta">
              {formatCurrency(summary.total_overdue_home, currentTrip.home_currency)}
            </p>
            <p className="text-xs text-ink/50">{summary.count_overdue} item{summary.count_overdue !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-navy text-parchment'
                : 'bg-parchment-dark/30 text-ink hover:bg-parchment-dark/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Deposit list */}
      {isLoading ? (
        <p className="text-ink/50 text-center py-8">Loading deposits...</p>
      ) : filtered.length === 0 ? (
        <div className="vintage-card text-center py-12">
          <p className="text-3xl mb-2">🔖</p>
          <p className="text-ink/60">No deposits yet.</p>
          {isOrganiser && (
            <button
              className="btn-primary mt-4"
              onClick={() => { setEditingDeposit(null); setForm(emptyForm); setShowForm(true); }}
            >
              Add first deposit
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <div key={d.id} className="vintage-card p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-semibold text-ink">{d.description}</p>
                  <span className={`badge ${statusBadgeClass(d.status)} text-xs px-2 py-0.5 rounded`}>
                    {d.status}
                  </span>
                  {d.linked_type && (
                    <span className="badge badge-navy text-xs">{d.linked_type}</span>
                  )}
                </div>
                <p className="text-lg font-bold text-navy">
                  {formatCurrency(d.amount, d.currency)}
                  {d.amount_home !== null && d.currency !== currentTrip.home_currency && (
                    <span className="text-sm font-normal text-ink/50 ml-2">
                      (~{formatCurrency(d.amount_home, currentTrip.home_currency)})
                    </span>
                  )}
                </p>
                {d.due_date && (
                  <p className="text-sm text-ink/60 mt-1">
                    Due: {parseLocalDate(d.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {d.notes && <p className="text-sm text-ink/50 mt-1 italic">{d.notes}</p>}
              </div>
              {isOrganiser && (
                <div className="flex flex-col gap-2 shrink-0">
                  {d.status !== 'paid' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: d.id, status: 'paid' })}
                      className="btn-secondary text-xs py-1 px-2"
                      title="Mark as paid"
                    >
                      ✓ Paid
                    </button>
                  )}
                  {d.status === 'pending' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: d.id, status: 'overdue' })}
                      className="btn-danger text-xs py-1 px-2"
                      title="Mark as overdue"
                    >
                      Overdue
                    </button>
                  )}
                  <button onClick={() => openEdit(d)} className="btn-secondary text-xs py-1 px-2">
                    Edit
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this deposit?')) deleteMutation.mutate(d.id); }}
                    className="btn-danger text-xs py-1 px-2"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="vintage-card w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-display font-bold text-navy mb-4">
              {editingDeposit ? 'Edit Deposit' : 'Add Deposit'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Description *</label>
                <input
                  className="vintage-input w-full"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="vintage-input w-full"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Currency</label>
                  <input
                    className="vintage-input w-full uppercase"
                    maxLength={3}
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Due Date</label>
                <input
                  type="date"
                  className="vintage-input w-full"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Category</label>
                <select
                  className="vintage-input w-full"
                  value={form.linked_type}
                  onChange={(e) => setForm({ ...form, linked_type: e.target.value })}
                >
                  <option value="">None</option>
                  {LINKED_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea
                  className="vintage-input w-full"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingDeposit ? 'Save Changes' : 'Add Deposit'}
                </button>
                <button type="button" className="btn-secondary flex-1"
                  onClick={() => { setShowForm(false); setEditingDeposit(null); setForm(emptyForm); }}>
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
