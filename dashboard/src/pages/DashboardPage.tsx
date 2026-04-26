import { Link } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import { useQuery } from '@tanstack/react-query';
import { travellersApi } from '@/api/travellers';
import { itineraryApi } from '@/api/itinerary';
import { expensesApi } from '@/api/expenses';
import { depositsApi } from '@/api/deposits';
import { settlementsApi } from '@/api/settlements';
import { announcementsApi } from '@/api/announcements';
import { ACTIVITY_ICONS } from '@trip-planner-ai/shared';
import type { ActivityType } from '@trip-planner-ai/shared';
import { parseLocalDate } from '@/utils/date';

const ACTIVITY_COLOURS: Record<string, { bg: string; text: string }> = {
  flight:        { bg: 'bg-blue-50',   text: 'text-blue-600'   },
  transport:     { bg: 'bg-slate-50',  text: 'text-slate-500'  },
  hotel:         { bg: 'bg-purple-50', text: 'text-purple-600' },
  food:          { bg: 'bg-orange-50', text: 'text-orange-500' },
  sightseeing:   { bg: 'bg-emerald-50',text: 'text-emerald-600'},
  beach:         { bg: 'bg-cyan-50',   text: 'text-cyan-600'   },
  shopping:      { bg: 'bg-pink-50',   text: 'text-pink-500'   },
  entertainment: { bg: 'bg-amber-50',  text: 'text-amber-600'  },
  custom:        { bg: 'bg-gray-50',   text: 'text-gray-500'   },
};
import {
  Users,
  CalendarDays,
  MapPin,
  Receipt,
  Bookmark,
  Scale,
  Clock,
  Megaphone,
  Pin,
} from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import SetupCard from '@/components/dashboard/SetupCard';

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBg: string;
}

function StatCard({ icon, value, label, iconBg }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-parchment-dark p-4 flex items-center gap-3 shadow-[var(--shadow-card)]">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-display text-xl font-bold text-ink leading-none">{value}</div>
        <div className="text-xs text-ink-faint font-body mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { currentTrip } = useTrip();

  const { data: travellers } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: days } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: expenseSummary = [] } = useQuery({
    queryKey: ['expenses', 'summary', currentTrip?.id],
    queryFn: () => expensesApi.summary(currentTrip!.id),
    enabled: !!currentTrip,
    staleTime: 60_000,
  });

  const { data: depositSummary } = useQuery({
    queryKey: ['deposits', 'summary', currentTrip?.id],
    queryFn: () => depositsApi.summary(currentTrip!.id),
    enabled: !!currentTrip,
    staleTime: 60_000,
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements', currentTrip?.id],
    queryFn: () => settlementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
    staleTime: 60_000,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements', currentTrip?.id],
    queryFn: () => announcementsApi.list(currentTrip!.id),
    enabled: !!currentTrip,
    staleTime: 60_000,
  });

  if (!currentTrip) return null;

  const totalSpent        = expenseSummary.reduce((s, r) => s + r.total_home, 0);
  const pendingSettlements = settlements.filter((s) => s.status === 'pending').length;
  const depositsOutstanding = (depositSummary?.total_pending_home ?? 0) + (depositSummary?.total_overdue_home ?? 0);
  const totalActivities   = days?.reduce((sum, d) => sum + d.activities.length, 0) ?? 0;
  const pinnedAnnouncements = announcements.filter((a) => a.pinned);
  const latestAnnouncement = pinnedAnnouncements[0] ?? announcements[0];

  // Today's plan
  const _now = new Date();
  const _pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}`;
  const todayDay = days?.find((d) => d.date.startsWith(todayStr));

  // Next upcoming day if today has no entry
  const upcomingDay = !todayDay
    ? days?.find((d) => d.date > todayStr)
    : null;

  const planDay = todayDay ?? upcomingDay;
  const planLabel = todayDay ? "Today's Plan" : upcomingDay ? 'Next Up' : "Today's Plan";

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: currentTrip.home_currency }).format(n);

  const showFinance = totalSpent > 0 || depositsOutstanding > 0 || pendingSettlements > 0;

  return (
    <div className="space-y-4">

      {/* ── Onboarding card (organiser only, until all 4 sections filled) ── */}
      <SetupCard />

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Users size={18} strokeWidth={1.75} className="text-[#3A6666]" />}
          value={travellers?.length ?? 0}
          label="Travellers"
          iconBg="bg-[#EBF4F4]"
        />
        <StatCard
          icon={<CalendarDays size={18} strokeWidth={1.75} className="text-violet-600" />}
          value={days?.length ?? 0}
          label="Days Planned"
          iconBg="bg-violet-50"
        />
        <StatCard
          icon={<MapPin size={18} strokeWidth={1.75} className="text-orange-500" />}
          value={totalActivities}
          label="Activities"
          iconBg="bg-orange-50"
        />
        <StatCard
          icon={<Receipt size={18} strokeWidth={1.75} className="text-emerald-600" />}
          value={totalSpent > 0 ? fmt(totalSpent) : '—'}
          label="Total Spent"
          iconBg="bg-emerald-50"
        />
      </div>

      {/* ── Pinned announcement banner ── */}
      {latestAnnouncement && (
        <Link
          to="/community"
          className="flex items-start gap-3 bg-navy/5 border border-navy/15 rounded-xl px-4 py-3 hover:bg-navy/10 transition-colors"
        >
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            {latestAnnouncement.pinned
              ? <Pin size={13} strokeWidth={2.5} className="text-navy" />
              : <Megaphone size={13} strokeWidth={2} className="text-navy" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-semibold text-navy truncate">{latestAnnouncement.title}</p>
            <p className="text-xs text-ink-faint font-body line-clamp-1 mt-0.5">{latestAnnouncement.content}</p>
          </div>
          <span className="text-xs text-navy font-body flex-shrink-0 mt-0.5">View →</span>
        </Link>
      )}

      {/* ── Today's / Next Plan ── */}
      <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-parchment-dark flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">{planLabel}</h3>
            {planDay && (
              <p className="text-xs text-ink-faint mt-0.5">
                {planDay.title || `Day ${planDay.day_number}`} ·{' '}
                {parseLocalDate(planDay.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            )}
          </div>
          <Link to="/itinerary" className="text-xs text-navy hover:underline font-body">View all →</Link>
        </div>
        {!planDay ? (
          <div className="p-8 text-center">
            <CalendarDays size={28} className="text-ink-faint mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-ink-faint">No activities planned yet.</p>
            <Link to="/itinerary" className="text-xs text-navy hover:underline mt-1 inline-block">Build itinerary →</Link>
          </div>
        ) : planDay.activities.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-faint">Nothing scheduled for this day yet.</p>
            <Link to="/itinerary" className="text-xs text-navy hover:underline mt-1 inline-block">Add activities →</Link>
          </div>
        ) : (
          <div className="divide-y divide-parchment-dark">
            {planDay.activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg leading-none ${(ACTIVITY_COLOURS[activity.type] ?? ACTIVITY_COLOURS.custom).bg}`}>
                  {ACTIVITY_ICONS[activity.type as ActivityType] ?? '📍'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm font-display truncate">{activity.description}</div>
                  {activity.location_tag && (
                    <div className="flex items-center gap-1 text-xs text-ink-faint font-body mt-0.5">
                      <MapPin size={10} strokeWidth={2} />
                      {activity.location_tag}
                    </div>
                  )}
                </div>
                {activity.time && (
                  <div className="flex items-center gap-1 text-xs text-ink-faint font-body flex-shrink-0">
                    <Clock size={11} strokeWidth={2} />
                    {activity.time.slice(0, 5)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Finances at a Glance ── */}
      {showFinance && (
        <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-parchment-dark">
            <h3 className="font-display text-sm font-semibold text-ink">Finances</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-parchment-dark">
            <Link to="/expenses"
              className="flex flex-col items-center gap-1 p-4 hover:bg-parchment/50 transition-colors text-center group"
            >
              <div className="w-8 h-8 rounded-xl bg-[#EBF4F4] flex items-center justify-center mb-1 group-hover:bg-[#D4EDED] transition-colors">
                <Receipt size={15} strokeWidth={1.75} className="text-navy" />
              </div>
              <span className="font-display text-sm font-bold text-ink">{fmt(totalSpent)}</span>
              <span className="text-xs text-ink-faint font-body">Total Spent</span>
            </Link>
            <Link to="/expenses"
              className="flex flex-col items-center gap-1 p-4 hover:bg-parchment/50 transition-colors text-center group"
            >
              <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center mb-1 group-hover:bg-orange-100 transition-colors">
                <Bookmark size={15} strokeWidth={1.75} className="text-gold-aged" />
              </div>
              <span className="font-display text-sm font-bold text-ink">{fmt(depositsOutstanding)}</span>
              <span className="text-xs text-ink-faint font-body">Deposits Due</span>
            </Link>
            <Link to="/expenses"
              className="flex flex-col items-center gap-1 p-4 hover:bg-parchment/50 transition-colors text-center group"
            >
              <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center mb-1 group-hover:bg-violet-100 transition-colors">
                <Scale size={15} strokeWidth={1.75} className="text-violet-600" />
              </div>
              <span className="font-display text-sm font-bold text-ink">{pendingSettlements}</span>
              <span className="text-xs text-ink-faint font-body">Pending</span>
            </Link>
          </div>
        </div>
      )}

      {/* ── Weather widget ── */}
      <WeatherWidget />
    </div>
  );
}
