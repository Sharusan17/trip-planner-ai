import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Map,
  Wallet,
  Package,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Plane,
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
  { to: '/map',        label: 'Map',        Icon: Map             },
  { to: '/expenses',   label: 'Finance',    Icon: Wallet          },
  { to: '/logistics',  label: 'Logistics',  Icon: Package         },
  { to: '/community',  label: 'Community',  Icon: MessageSquare   },
];

export default function Sidebar() {
  const { currentTrip, activeTraveller, isOrganiser, clearSession } = useTrip();
  const [drawerOpen, setDrawerOpen] = useState(false);
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
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
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
                {label}
              </>
            )}
          </NavLink>
        ))}

        {/* Trip Settings — organiser only */}
        {isOrganiser && (
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
        )}
      </nav>

      {/* Bottom: My Profile + Leave Trip */}
      <div className="px-3 py-3 border-t border-[var(--color-sidebar-border)] space-y-1">
        {/* My Profile */}
        {activeTraveller && (
          <button
            onClick={() => { navigate('/profile'); onNav?.(); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-ink-faint hover:text-ink hover:bg-parchment transition-all duration-150 font-body"
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-ink-faint hover:text-terracotta hover:bg-red-50 transition-all duration-150 font-body"
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
      <aside className="hidden md:flex flex-col w-60 min-h-screen bg-[var(--color-sidebar)] border-r border-[var(--color-sidebar-border)] flex-shrink-0">
        {navContent()}
      </aside>

      {/* ── Mobile: hamburger button ──────────────────────────── */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-xl bg-[#1C1917] text-white flex items-center justify-center shadow-lg"
      >
        <Menu size={20} strokeWidth={2} />
      </button>

      {/* ── Mobile: backdrop ─────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-[#1C1917]/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile: slide-in drawer ───────────────────────────── */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-64 z-50 bg-[var(--color-sidebar)] flex flex-col transition-transform duration-300 ease-out shadow-2xl border-r border-[var(--color-sidebar-border)] ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-parchment transition-colors"
        >
          <X size={18} strokeWidth={2} />
        </button>

        {navContent(() => setDrawerOpen(false))}
      </aside>
    </>
  );
}
