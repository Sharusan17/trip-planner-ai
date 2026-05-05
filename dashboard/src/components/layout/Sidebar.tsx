import { NavLink, useNavigate } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import { useQuery } from '@tanstack/react-query';
import { expenseClaimsApi } from '@/api/expenseClaims';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  MessageSquare,
  LogOut,
  X,
  Plane,
  BedDouble,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

const navItems: NavItem[] = [
  { to: '/dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/travellers', label: 'Travellers', Icon: Users           },
  { to: '/itinerary',  label: 'Itinerary',  Icon: CalendarDays    },
  { to: '/expenses',   label: 'Finance',    Icon: Wallet          },
  { to: '/transport',  label: 'Travel',     Icon: Plane           },
  { to: '/stays',      label: 'Stays',      Icon: BedDouble       },
  { to: '/community',  label: 'Community',  Icon: MessageSquare   },
];

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentTrip, activeTraveller, isOrganiser, clearSession } = useTrip();
  const { data: _sidebarPendingClaims = [] } = useQuery({
    queryKey: ['claims', 'pending', currentTrip?.id, activeTraveller?.id],
    queryFn: () => expenseClaimsApi.listPending(currentTrip!.id, activeTraveller!.id),
    enabled: !!currentTrip && !!activeTraveller,
    refetchInterval: 20_000,
    staleTime: 0,
  });
  const claimBadge = _sidebarPendingClaims.length;
  const navigate = useNavigate();

  const navContent = (onNav?: () => void) => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--color-sidebar-border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1C1917] flex items-center justify-center flex-shrink-0 shadow-sm">
            <Plane size={16} className="text-white" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-sm font-bold text-ink leading-tight tracking-tight">
              Trip Planner
            </h1>
            {currentTrip && (
              <p className="text-xs text-ink-faint mt-0.5 truncate">{currentTrip.destination}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => {
          // Finance nav deep-links to Claims tab when there are pending claims
          const resolvedTo = to === '/expenses' && claimBadge > 0 ? '/expenses?tab=claims' : to;
          return (
            <NavLink
              key={to}
              to={resolvedTo}
              onClick={onNav}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#1C1917] text-white shadow-sm'
                    : 'text-ink-faint hover:text-ink hover:bg-parchment'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {to === '/expenses' && claimBadge > 0 && (
                    <span className="ml-auto w-5 h-5 rounded-full bg-terracotta text-white text-[10px]
                                      font-bold flex items-center justify-center shrink-0 leading-none">
                      {claimBadge > 9 ? '9+' : claimBadge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}

      </nav>

      {/* Settings — organiser only, just above the divider */}
      {isOrganiser && (
        <div className="px-3 pb-1">
          <NavLink
            to="/settings"
            onClick={onNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[#1C1917] text-white shadow-sm'
                  : 'text-ink-faint hover:text-ink hover:bg-parchment'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings size={17} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
                Settings
              </>
            )}
          </NavLink>
        </div>
      )}

      {/* Bottom: My Profile + Leave Trip */}
      <div className="px-3 py-3 border-t border-[var(--color-sidebar-border)] space-y-1">
        {/* My Profile */}
        {activeTraveller && (
          <button
            onClick={() => { navigate('/profile'); onNav?.(); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-ink-light hover:text-ink hover:bg-parchment transition-all duration-150 font-body"
          >
            {activeTraveller.has_photo ? (
              <img
                src={travellersApi.getPhotoUrl(activeTraveller.id)}
                alt={activeTraveller.name}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: activeTraveller.avatar_colour }}
              >
                {activeTraveller.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate">{activeTraveller.name}</span>
          </button>
        )}

        {/* Leave trip */}
        <button
          onClick={() => { clearSession(); onNav?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-ink-light hover:text-terracotta hover:bg-red-50 transition-all duration-150 font-body"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Leave Trip
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--color-sidebar)] border-r border-[var(--color-sidebar-border)] flex-shrink-0">
        {navContent()}
      </aside>

      {/* ── Mobile: full-screen overlay (Apple.com style) ────────── */}
      <aside
        className={`md:hidden fixed inset-0 z-50 flex flex-col bg-[var(--color-sidebar)] transition-opacity duration-300 ease-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Header row: logo + close button */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--color-sidebar-border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1917] flex items-center justify-center flex-shrink-0 shadow-sm">
              <Plane size={16} className="text-white" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-sm font-bold text-ink leading-tight tracking-tight">
                Trip Planner
              </h1>
              {currentTrip && (
                <p className="text-xs text-ink-faint mt-0.5 truncate">{currentTrip.destination}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => onClose()}
            aria-label="Close menu"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-faint hover:text-ink hover:bg-parchment transition-colors"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        {/* Nav items — larger touch targets */}
        <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => {
            const resolvedTo = to === '/expenses' && claimBadge > 0 ? '/expenses?tab=claims' : to;
            return (
              <NavLink
                key={to}
                to={resolvedTo}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-4 px-4 py-3.5 rounded-xl font-body font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#1C1917] text-white shadow-sm'
                      : 'text-ink hover:bg-parchment'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={20} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
                    <span className="flex-1 text-base">{label}</span>
                    {to === '/expenses' && claimBadge > 0 && (
                      <span className="ml-auto w-5 h-5 rounded-full bg-terracotta text-white text-[10px]
                                        font-bold flex items-center justify-center shrink-0 leading-none">
                        {claimBadge > 9 ? '9+' : claimBadge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}

        </nav>

        {/* Settings — just above the divider */}
        {isOrganiser && (
          <div className="px-4 pb-1">
            <NavLink
              to="/settings"
              onClick={() => onClose()}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3.5 rounded-xl font-body font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#1C1917] text-white shadow-sm'
                    : 'text-ink hover:bg-parchment'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Settings size={20} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
                  <span className="text-base">Settings</span>
                </>
              )}
            </NavLink>
          </div>
        )}

        {/* Bottom: profile + leave trip */}
        <div className="px-4 py-4 border-t border-[var(--color-sidebar-border)] space-y-1">
          {activeTraveller && (
            <button
              onClick={() => { navigate('/profile'); onClose(); }}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-ink-light hover:text-ink hover:bg-parchment transition-all duration-150 font-body"
            >
              {activeTraveller.has_photo ? (
                <img
                  src={travellersApi.getPhotoUrl(activeTraveller.id)}
                  alt={activeTraveller.name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: activeTraveller.avatar_colour }}
                >
                  {activeTraveller.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-base">{activeTraveller.name}</span>
            </button>
          )}
          <button
            onClick={() => { clearSession(); onClose(); }}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-ink-light hover:text-terracotta hover:bg-red-50 transition-all duration-150 font-body"
          >
            <LogOut size={20} strokeWidth={1.75} />
            <span className="text-base">Leave Trip</span>
          </button>
        </div>
      </aside>
    </>
  );
}
