import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expensesApi } from '@/api/expenses';
import { depositsApi } from '@/api/deposits';
import { settlementsApi } from '@/api/settlements';
import { travellersApi } from '@/api/travellers';
import { familiesApi } from '@/api/families';
import { parseLocalDate } from '@/utils/date';
import { ArrowLeft, Printer, Users, User, Home, ChevronRight } from 'lucide-react';
import { EXPENSE_CATEGORY_ICONS } from '@trip-planner-ai/shared';
import type { Expense } from '@trip-planner-ai/shared';
import { API_BASE } from '@/api/client';

type ReportType = 'group' | 'family' | 'individual';
type Step = 'pick-type' | 'pick-subject' | 'report';

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function fmtD(d: string) {
  return parseLocalDate(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtShort(d: string) {
  return parseLocalDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Avatar({ name, colour, size = 8 }: { name: string; colour: string; size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: colour, fontSize: size < 9 ? '0.7rem' : '0.85rem' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, count, total, currency }: {
  emoji: string; title: string; count: number; total: number; currency: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b-2 border-parchment-dark mb-0">
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        <span className="text-xs text-ink-faint bg-parchment px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <span className="font-display font-bold text-ink">{fmt(total, currency)}</span>
    </div>
  );
}

// ── The report content (also used for printing) ────────────────────────────────
function ReportContent({
  title, subtitle, expenses, deposits, transfers, travellers, homeCurrency, reportType, subjectId, families,
}: {
  title: string;
  subtitle: string;
  expenses: Expense[];
  deposits: ReturnType<typeof Object.values>[number][];
  transfers: any[];
  travellers: any[];
  homeCurrency: string;
  reportType: ReportType;
  subjectId: string | null;
  families: any[];
}) {
  const getName = (id: string) => travellers.find((t: any) => t.id === id)?.name ?? 'Unknown';
  const getColour = (id: string) => travellers.find((t: any) => t.id === id)?.avatar_colour ?? '#94A3B8';

  const sortedExpenses = [...expenses].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
  const sortedDeposits = [...deposits].sort((a: any, b: any) => {
    const da = a.due_date ?? a.created_at;
    const db = b.due_date ?? b.created_at;
    return db.localeCompare(da);
  });
  const sortedTransfers = [...transfers].sort((a, b) =>
    b.transfer_date.localeCompare(a.transfer_date)
  );

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount_home ?? e.amount), 0);
  const totalDeposits = deposits.reduce((s: number, d: any) => s + (d.amount_home ?? d.amount), 0);
  const totalTransfers = transfers.reduce((s: number, t: any) => s + (t.amount_home ?? t.amount), 0);

  // Per-traveller spend breakdown (for group report)
  const travellerSpend: Record<string, number> = {};
  for (const e of expenses) {
    for (const split of e.splits) {
      travellerSpend[split.traveller_id] = (travellerSpend[split.traveller_id] ?? 0) + (split.amount_home ?? split.amount);
    }
  }

  return (
    <div className="print-content space-y-0">
      {/* Report header */}
      <div className="report-header bg-[#1C1917] text-white rounded-2xl p-6 mb-6 print:rounded-none print:mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/50 text-xs font-body uppercase tracking-widest mb-1">Trip Report</p>
            <h1 className="font-display text-2xl font-bold leading-tight">{title}</h1>
            <p className="text-white/70 text-sm mt-1">{subtitle}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-white/50 text-xs">Generated</p>
            <p className="text-white/90 text-sm font-medium">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-white/10">
          <div>
            <p className="text-white/50 text-[10px] uppercase tracking-wide">Deposits</p>
            <p className="font-display font-bold text-lg text-white">{fmt(totalDeposits, homeCurrency)}</p>
            <p className="text-white/40 text-xs">{deposits.length} item{deposits.length !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-white/50 text-[10px] uppercase tracking-wide">Expenses</p>
            <p className="font-display font-bold text-lg text-white">{fmt(totalExpenses, homeCurrency)}</p>
            <p className="text-white/40 text-xs">{expenses.length} item{expenses.length !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-white/50 text-[10px] uppercase tracking-wide">Transfers</p>
            <p className="font-display font-bold text-lg text-white">{fmt(totalTransfers, homeCurrency)}</p>
            <p className="text-white/40 text-xs">{transfers.length} item{transfers.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Traveller breakdown — group report only */}
      {reportType === 'group' && travellers.length > 1 && (
        <div className="vintage-card p-5 mb-4">
          <h2 className="font-display text-sm font-bold text-ink mb-3 flex items-center gap-2">
            <Users size={14} className="text-ink-faint" /> Per-Person Breakdown
          </h2>
          <div className="space-y-2">
            {travellers
              .filter((t: any) => travellerSpend[t.id] > 0)
              .sort((a: any, b: any) => (travellerSpend[b.id] ?? 0) - (travellerSpend[a.id] ?? 0))
              .map((t: any) => {
                const spent = travellerSpend[t.id] ?? 0;
                const pct = totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0;
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <Avatar name={t.name} colour={t.avatar_colour} size={7} />
                    <span className="text-sm text-ink w-28 truncate">{t.name}</span>
                    <div className="flex-1 h-1.5 bg-parchment-dark rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: t.avatar_colour }} />
                    </div>
                    <span className="text-sm font-semibold text-ink w-20 text-right">{fmt(spent, homeCurrency)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Deposits ──────────────────────────────────────────────────────────── */}
      <div className="vintage-card overflow-hidden mb-4">
        <div className="px-5 pt-5 pb-0">
          <SectionHeader emoji="💰" title="Deposits &amp; Payments" count={deposits.length} total={totalDeposits} currency={homeCurrency} />
        </div>
        {sortedDeposits.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-faint">No deposits recorded.</p>
        ) : (
          <div className="divide-y divide-parchment-dark">
            {sortedDeposits.map((d: any) => (
              <div key={d.id} className="px-5 py-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{d.description}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {d.due_date && (
                      <span className="text-xs text-ink-faint">{fmtShort(d.due_date)}</span>
                    )}
                    {d.linked_type && (
                      <span className="text-xs text-ink-faint capitalize">· {d.linked_type}</span>
                    )}
                    {d.notes && <span className="text-xs text-ink-faint">· {d.notes}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-ink">{fmt(d.amount_home ?? d.amount, homeCurrency)}</p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${
                    d.status === 'held'      ? 'bg-blue-50 text-blue-700' :
                    d.status === 'refunded'  ? 'bg-green-50 text-green-700' :
                    d.status === 'forfeited' ? 'bg-red-50 text-red-600' :
                    d.status === 'overdue'   ? 'bg-red-50 text-red-600' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {d.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Expenses ──────────────────────────────────────────────────────────── */}
      <div className="vintage-card overflow-hidden mb-4">
        <div className="px-5 pt-5 pb-0">
          <SectionHeader emoji="🧾" title="Expenses" count={expenses.length} total={totalExpenses} currency={homeCurrency} />
        </div>
        {sortedExpenses.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-faint">No expenses recorded.</p>
        ) : (
          <div className="divide-y divide-parchment-dark">
            {sortedExpenses.map((e) => {
              const paidByName = getName(e.paid_by);
              const paidByColour = getColour(e.paid_by);
              // For individual report, show this person's split amount
              const myShare = reportType === 'individual' && subjectId
                ? e.splits.find((s) => s.traveller_id === subjectId)
                : null;
              return (
                <div key={e.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">{EXPENSE_CATEGORY_ICONS[e.category]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">{e.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-ink-faint">{fmtD(e.expense_date)}</span>
                        <span className="text-ink-faint text-xs">·</span>
                        <div className="flex items-center gap-1">
                          <Avatar name={paidByName} colour={paidByColour} size={4} />
                          <span className="text-xs text-ink-faint">{paidByName}</span>
                        </div>
                        {e.currency !== homeCurrency && (
                          <>
                            <span className="text-ink-faint text-xs">·</span>
                            <span className="text-xs text-ink-faint">{fmt(e.amount, e.currency)}</span>
                          </>
                        )}
                      </div>
                      {/* Splits row — compact chips */}
                      {reportType !== 'individual' && e.splits.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {e.splits.map((s) => (
                            <span key={s.traveller_id}
                              className="inline-flex items-center gap-1 text-[10px] bg-parchment px-1.5 py-0.5 rounded-full text-ink-light border border-parchment-dark">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getColour(s.traveller_id) }}
                              />
                              {getName(s.traveller_id)} {fmt(s.amount_home ?? s.amount, homeCurrency)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-ink">{fmt(e.amount_home ?? e.amount, homeCurrency)}</p>
                      {myShare && (
                        <p className="text-xs text-ink-faint">
                          your share: {fmt(myShare.amount_home ?? myShare.amount, homeCurrency)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Receipts Bundle ───────────────────────────────────────────────────── */}
      {(() => {
        const receipts = expenses.filter((e) => e.receipt_filename);
        if (receipts.length === 0) return null;
        return (
          <div className="vintage-card overflow-hidden mb-4">
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center justify-between py-3 border-b-2 border-parchment-dark mb-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧾</span>
                  <h2 className="font-display text-base font-bold text-ink">Receipts</h2>
                  <span className="text-xs text-ink-faint bg-parchment px-2 py-0.5 rounded-full">{receipts.length}</span>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 gap-4 print:grid-cols-3">
              {receipts.map((e) => (
                <div key={e.id} className="flex flex-col gap-1.5">
                  <div className="rounded-xl overflow-hidden border border-parchment-dark bg-parchment aspect-[3/4]">
                    <img
                      src={`${API_BASE}/expenses/${e.id}/receipt`}
                      alt={e.description}
                      className="w-full h-full object-cover"
                      onError={(ev) => {
                        (ev.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <p className="text-xs font-medium text-ink leading-tight line-clamp-2">{e.description}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-ink-faint">{fmtShort(e.expense_date)}</p>
                    <p className="text-[10px] font-semibold text-navy">{fmt(e.amount_home ?? e.amount, homeCurrency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Transfers ─────────────────────────────────────────────────────────── */}
      <div className="vintage-card overflow-hidden">
        <div className="px-5 pt-5 pb-0">
          <SectionHeader emoji="↔️" title="Transfers" count={transfers.length} total={totalTransfers} currency={homeCurrency} />
        </div>
        {sortedTransfers.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-faint">No transfers recorded.</p>
        ) : (
          <div className="divide-y divide-parchment-dark">
            {sortedTransfers.map((t: any) => {
              const fromName = t.from_name ?? getName(t.from_traveller);
              const fromColour = t.from_colour ?? getColour(t.from_traveller);
              const toName = t.to_name ?? getName(t.to_traveller);
              const toColour = t.to_colour ?? getColour(t.to_traveller);
              return (
                <div key={t.id} className="px-5 py-3.5 flex items-start gap-3">
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    <Avatar name={fromName} colour={fromColour} size={6} />
                    <span className="text-ink-faint text-xs">→</span>
                    <Avatar name={toName} colour={toColour} size={6} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">
                      <span className="font-semibold">{fromName}</span>
                      <span className="text-ink-faint mx-1.5">→</span>
                      <span className="font-semibold">{toName}</span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-ink-faint">{fmtD(t.transfer_date)}</span>
                      {t.note && <><span className="text-ink-faint text-xs">·</span><span className="text-xs text-ink-faint">{t.note}</span></>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-ink">{fmt(t.amount_home ?? t.amount, homeCurrency)}</p>
                    {t.currency !== homeCurrency && (
                      <p className="text-xs text-ink-faint">{fmt(t.amount, t.currency)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-parchment-dark text-center">
        <p className="text-xs text-ink-faint">
          Generated by Holiday Plan · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { currentTrip } = useTrip();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('pick-type');
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedTravellerId, setSelectedTravellerId] = useState<string | null>(null);

  const tripId = currentTrip?.id;

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', tripId],
    queryFn: () => expensesApi.list(tripId!),
    enabled: !!tripId,
  });
  const { data: deposits = [] } = useQuery({
    queryKey: ['deposits', tripId, 'all'],
    queryFn: () => depositsApi.list(tripId!),
    enabled: !!tripId,
  });
  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers', tripId],
    queryFn: () => settlementsApi.listTransfers(tripId!),
    enabled: !!tripId,
  });
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId!),
    enabled: !!tripId,
  });
  const { data: families = [] } = useQuery({
    queryKey: ['families', tripId],
    queryFn: () => familiesApi.list(tripId!),
    enabled: !!tripId,
  });

  const homeCurrency = currentTrip?.home_currency ?? 'GBP';

  const getName = (id: string) => travellers.find((t) => t.id === id)?.name ?? 'Unknown';

  // ── Filtered data based on report type + subject ───────────────────────────
  const filteredExpenses = useMemo(() => {
    if (reportType === 'group') return expenses;
    if (reportType === 'family' && selectedFamilyId) {
      const fam = families.find((f) => f.id === selectedFamilyId);
      if (!fam) return [];
      const memberIds = new Set(fam.members.map((m: any) => m.id));
      return expenses.filter(
        (e) => memberIds.has(e.paid_by) || e.splits.some((s) => memberIds.has(s.traveller_id))
      );
    }
    if (reportType === 'individual' && selectedTravellerId) {
      return expenses.filter(
        (e) => e.paid_by === selectedTravellerId || e.splits.some((s) => s.traveller_id === selectedTravellerId)
      );
    }
    return [];
  }, [expenses, reportType, selectedFamilyId, selectedTravellerId, families]);

  const filteredTransfers = useMemo(() => {
    if (reportType === 'group') return transfers;
    if (reportType === 'family' && selectedFamilyId) {
      const fam = families.find((f) => f.id === selectedFamilyId);
      if (!fam) return [];
      const memberIds = new Set(fam.members.map((m: any) => m.id));
      return transfers.filter((t) => memberIds.has(t.from_traveller) || memberIds.has(t.to_traveller));
    }
    if (reportType === 'individual' && selectedTravellerId) {
      return transfers.filter(
        (t) => t.from_traveller === selectedTravellerId || t.to_traveller === selectedTravellerId
      );
    }
    return [];
  }, [transfers, reportType, selectedFamilyId, selectedTravellerId, families]);

  // deposits shown for all report types (group = all, family/individual = all as they're trip-level)
  const reportDeposits = deposits;

  function pickType(type: ReportType) {
    setReportType(type);
    if (type === 'group') {
      setStep('report');
    } else {
      setSelectedFamilyId(null);
      setSelectedTravellerId(null);
      setStep('pick-subject');
    }
  }

  function pickSubject(id: string) {
    if (reportType === 'family') setSelectedFamilyId(id);
    else setSelectedTravellerId(id);
    setStep('report');
  }

  function goBack() {
    if (step === 'report') {
      if (reportType === 'group') {
        setStep('pick-type');
        setReportType(null);
      } else {
        setStep('pick-subject');
      }
    } else if (step === 'pick-subject') {
      setStep('pick-type');
      setReportType(null);
    } else {
      navigate('/expenses');
    }
  }

  if (!currentTrip) return null;

  // ── Report title ───────────────────────────────────────────────────────────
  let reportTitle = `${currentTrip.name} — Full Group Report`;
  let reportSubtitle = `${currentTrip.destination} · ${fmtD(currentTrip.start_date)} – ${fmtD(currentTrip.end_date)}`;
  const subjectId = reportType === 'family' ? selectedFamilyId : selectedTravellerId;

  if (reportType === 'family' && selectedFamilyId) {
    const fam = families.find((f) => f.id === selectedFamilyId);
    reportTitle = `${currentTrip.name} — ${fam?.name ?? ''} Report`;
  }
  if (reportType === 'individual' && selectedTravellerId) {
    reportTitle = `${currentTrip.name} — ${getName(selectedTravellerId)} Report`;
  }

  const backBtn = (
    <button
      onClick={goBack}
      className="no-print w-9 h-9 rounded-xl border border-parchment-dark flex items-center justify-center text-ink-faint hover:text-ink hover:bg-parchment transition-colors flex-shrink-0"
    >
      <ArrowLeft size={16} />
    </button>
  );

  // ══ SCREEN 1: Pick type ════════════════════════════════════════════════════
  if (step === 'pick-type') {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          {backBtn}
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Export Report</h1>
            <p className="text-sm text-ink-faint mt-0.5">Choose what to include in the report</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Group */}
          <button
            onClick={() => pickType('group')}
            className="vintage-card w-full p-5 text-left group hover:shadow-[var(--shadow-card-hover)] transition-all duration-150"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#1C1917] flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-ink text-base">Full Group Report</p>
                <p className="text-sm text-ink-faint mt-0.5">
                  Every expense, deposit and transfer — all {travellers.length} travellers
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-faint flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Family — only if families exist */}
          {families.length > 0 && (
            <button
              onClick={() => pickType('family')}
              className="vintage-card w-full p-5 text-left group hover:shadow-[var(--shadow-card-hover)] transition-all duration-150"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                  <Home size={20} className="text-gold-aged" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-ink text-base">Family Report</p>
                  <p className="text-sm text-ink-faint mt-0.5">
                    Filtered to one family group · {families.length} famil{families.length !== 1 ? 'ies' : 'y'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-ink-faint flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {/* Individual */}
          <button
            onClick={() => pickType('individual')}
            className="vintage-card w-full p-5 text-left group hover:shadow-[var(--shadow-card-hover)] transition-all duration-150"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                <User size={20} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-ink text-base">Individual Report</p>
                <p className="text-sm text-ink-faint mt-0.5">
                  One person's expenses, splits and transfers
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-faint flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ══ SCREEN 2: Pick subject ═════════════════════════════════════════════════
  if (step === 'pick-subject') {
    const isFamily = reportType === 'family';
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          {backBtn}
          <div>
            <h1 className="font-display text-xl font-bold text-ink">
              {isFamily ? 'Select Family' : 'Select Person'}
            </h1>
            <p className="text-sm text-ink-faint mt-0.5">
              {isFamily ? "Report will be filtered to this family's activity" : "Report will show this person's activity"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {isFamily
            ? families.map((fam: any) => (
                <button
                  key={fam.id}
                  onClick={() => pickSubject(fam.id)}
                  className="vintage-card w-full p-4 text-left flex items-center gap-4 group hover:shadow-[var(--shadow-card-hover)] transition-all duration-150"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold flex-shrink-0"
                    style={{ backgroundColor: fam.colour }}
                  >
                    {fam.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink">{fam.name}</p>
                    <p className="text-xs text-ink-faint">
                      {fam.members.length} member{fam.members.length !== 1 ? 's' : ''}
                      {' · '}{fam.members.map((m: any) => m.name).join(', ')}
                    </p>
                  </div>
                  <ChevronRight size={15} className="text-ink-faint flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ))
            : travellers.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => pickSubject(t.id)}
                  className="vintage-card w-full p-4 text-left flex items-center gap-4 group hover:shadow-[var(--shadow-card-hover)] transition-all duration-150"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 text-sm"
                    style={{ backgroundColor: t.avatar_colour }}
                  >
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="text-xs text-ink-faint capitalize">{t.type} · {t.role}</p>
                  </div>
                  <ChevronRight size={15} className="text-ink-faint flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ))
          }
        </div>
      </div>
    );
  }

  // ══ SCREEN 3: Report ═══════════════════════════════════════════════════════
  return (
    <div className="max-w-3xl mx-auto">
      {/* Toolbar — hidden on print */}
      <div className="no-print flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {backBtn}
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide">
              {reportType === 'group' ? 'Group' : reportType === 'family' ? 'Family' : 'Individual'} Report
            </p>
            <h1 className="font-display font-bold text-ink text-lg leading-tight">
              {reportType === 'family' && selectedFamilyId
                ? families.find((f: any) => f.id === selectedFamilyId)?.name
                : reportType === 'individual' && selectedTravellerId
                ? getName(selectedTravellerId)
                : currentTrip.name}
            </h1>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Printer size={15} />
          Print / PDF
        </button>
      </div>

      <ReportContent
        title={reportTitle}
        subtitle={reportSubtitle}
        expenses={filteredExpenses}
        deposits={reportDeposits}
        transfers={filteredTransfers}
        travellers={travellers}
        homeCurrency={homeCurrency}
        reportType={reportType!}
        subjectId={subjectId}
        families={families}
      />
    </div>
  );
}
