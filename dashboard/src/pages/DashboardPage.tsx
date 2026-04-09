import { Link } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import { useQuery } from '@tanstack/react-query';
import { travellersApi } from '@/api/travellers';
import { itineraryApi } from '@/api/itinerary';
import { weatherApi } from '@/api/weather';
import { expensesApi } from '@/api/expenses';
import { depositsApi } from '@/api/deposits';
import { settlementsApi } from '@/api/settlements';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users,
  CalendarDays,
  MapPin,
  Thermometer,
  Receipt,
  Bookmark,
  Scale,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';

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
  const [copied, setCopied] = useState(false);

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

  const { data: weather } = useQuery({
    queryKey: ['weather', currentTrip?.latitude, currentTrip?.longitude],
    queryFn: () => weatherApi.get(currentTrip!.latitude, currentTrip!.longitude),
    enabled: !!currentTrip && !!currentTrip.latitude,
    staleTime: 30 * 60 * 1000,
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

  if (!currentTrip) return null;

  const totalSpent = expenseSummary.reduce((s, r) => s + r.total_home, 0);
  const pendingSettlements = settlements.filter((s) => s.status === 'pending').length;
  const depositsOutstanding = (depositSummary?.total_pending_home ?? 0) + (depositSummary?.total_overdue_home ?? 0);
  const totalActivities = days?.reduce((sum, d) => sum + d.activities.length, 0) ?? 0;
  const todayWeather = weather?.daily?.[0];
  const shareUrl = `${window.location.origin}/?code=${currentTrip.group_code}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentTrip.group_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: currentTrip.home_currency }).format(n);

  return (
    <div className="space-y-5">

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Users size={18} strokeWidth={1.75} className="text-blue-600" />}
          value={travellers?.length ?? 0}
          label="Travellers"
          iconBg="bg-blue-50"
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
          icon={<Thermometer size={18} strokeWidth={1.75} className="text-emerald-600" />}
          value={todayWeather ? `${Math.round(todayWeather.temperature_max)}°` : '--'}
          label="Today's High"
          iconBg="bg-emerald-50"
        />
      </div>

      {/* ── Share trip ── */}
      <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-parchment-dark">
          <h3 className="font-display text-base font-semibold text-ink">Share This Trip</h3>
        </div>
        <div className="p-5 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-shrink-0 text-center">
            <div className="bg-parchment rounded-xl p-3 inline-block">
              <QRCodeSVG
                value={shareUrl}
                size={120}
                fgColor="#0F172A"
                bgColor="transparent"
              />
            </div>
            <p className="text-xs text-ink-faint mt-1.5">Scan to join</p>
          </div>
          <div className="flex-1 w-full">
            <p className="text-sm text-ink-light mb-2">Or share the group code:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-ink text-blue-300 text-xl tracking-[0.3em] font-mono px-4 py-2.5 rounded-xl text-center">
                {currentTrip.group_code}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 btn-secondary py-2.5 px-3 text-sm flex-shrink-0"
              >
                {copied ? <Check size={14} strokeWidth={2.5} className="text-green-600" /> : <Copy size={14} strokeWidth={2} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-2">
              Join at {window.location.origin} with this code
            </p>
          </div>
        </div>
      </div>

      {/* ── Travellers ── */}
      {travellers && travellers.length > 0 && (
        <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-parchment-dark flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">Travellers</h3>
            <Link to="/travellers" className="text-xs text-navy hover:underline font-body">
              Manage →
            </Link>
          </div>
          <div className="p-5 flex flex-wrap gap-2">
            {travellers.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 bg-parchment rounded-lg px-3 py-1.5"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: t.avatar_colour }}
                >
                  {t.name.charAt(0)}
                </div>
                <span className="text-sm font-medium text-ink font-body">{t.name}</span>
                <span className={`badge text-[10px] ${
                  t.type === 'child' ? 'badge-gold' : t.type === 'infant' ? 'badge-terracotta' : 'badge-navy'
                }`}>
                  {t.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Finances ── */}
      {(totalSpent > 0 || depositsOutstanding > 0 || pendingSettlements > 0) && (
        <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-parchment-dark">
            <h3 className="font-display text-base font-semibold text-ink">Finances at a Glance</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-parchment-dark">
            <Link
              to="/expenses"
              className="flex flex-col items-center gap-1 p-4 hover:bg-parchment/50 transition-colors text-center group"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center mb-1 group-hover:bg-blue-100 transition-colors">
                <Receipt size={16} strokeWidth={1.75} className="text-navy" />
              </div>
              <span className="font-display text-sm font-bold text-ink">{fmt(totalSpent)}</span>
              <span className="text-xs text-ink-faint font-body">Total Spent</span>
            </Link>
            <Link
              to="/deposits"
              className="flex flex-col items-center gap-1 p-4 hover:bg-parchment/50 transition-colors text-center group"
            >
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center mb-1 group-hover:bg-orange-100 transition-colors">
                <Bookmark size={16} strokeWidth={1.75} className="text-gold-aged" />
              </div>
              <span className="font-display text-sm font-bold text-ink">{fmt(depositsOutstanding)}</span>
              <span className="text-xs text-ink-faint font-body">Deposits Due</span>
            </Link>
            <Link
              to="/settlements"
              className="flex flex-col items-center gap-1 p-4 hover:bg-parchment/50 transition-colors text-center group"
            >
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mb-1 group-hover:bg-violet-100 transition-colors">
                <Scale size={16} strokeWidth={1.75} className="text-violet-600" />
              </div>
              <span className="font-display text-sm font-bold text-ink">{pendingSettlements}</span>
              <span className="text-xs text-ink-faint font-body">Pending</span>
            </Link>
          </div>
        </div>
      )}

      {/* ── Upcoming days ── */}
      {days && days.length > 0 && (
        <div className="bg-white rounded-xl border border-parchment-dark shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-parchment-dark flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">Upcoming Days</h3>
            <Link to="/itinerary" className="text-xs text-navy hover:underline font-body">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-parchment-dark">
            {days.slice(0, 3).map((day) => (
              <div key={day.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-navy font-display font-bold text-sm">{day.day_number}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm font-display truncate">
                    {day.title || `Day ${day.day_number}`}
                  </div>
                  <div className="text-xs text-ink-faint font-body">
                    {day.activities.length} activit{day.activities.length === 1 ? 'y' : 'ies'}
                  </div>
                </div>
                <div className="text-xs text-ink-faint font-body flex-shrink-0">
                  {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
