import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
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
  const { currentTrip, clearSession } = useTrip();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navContent = (onNav?: () => void) => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center flex-shrink-0">
            <Package size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-sm font-semibold text-white leading-tight tracking-tight">
              Trip Planner
            </h1>
            {currentTrip && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{currentTrip.destination}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-navy/20 text-blue-400 border-l-2 border-blue-400 pl-[10px]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-l-2 border-transparent pl-[10px]'
              }`
            }
          >
            <Icon size={17} strokeWidth={1.75} className="flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Leave trip */}
      <div className="px-3 py-3 border-t border-white/10">
        <button
          onClick={() => { clearSession(); onNav?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 font-body"
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
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-sidebar text-white border-r border-white/10 flex-shrink-0">
        {navContent()}
      </aside>

      {/* ── Mobile: hamburger button ──────────────────────────── */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-xl bg-sidebar text-white flex items-center justify-center shadow-lg"
      >
        <Menu size={20} strokeWidth={2} />
      </button>

      {/* ── Mobile: backdrop ─────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile: slide-in drawer ───────────────────────────── */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-72 z-50 bg-sidebar text-white flex flex-col transition-transform duration-300 ease-out shadow-2xl ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={18} strokeWidth={2} />
        </button>

        {navContent(() => setDrawerOpen(false))}
      </aside>
    </>
  );
}
