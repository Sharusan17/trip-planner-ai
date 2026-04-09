import { NavLink } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Map,
  ArrowLeftRight,
  Receipt,
  Scale,
  Plane,
  BedDouble,
  Bookmark,
  Megaphone,
  BarChart2,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/travellers', label: 'Travellers', Icon: Users },
  { to: '/itinerary', label: 'Itinerary', Icon: CalendarDays },
  { to: '/map', label: 'Map', Icon: Map },
  { to: '/currency', label: 'Currency', Icon: ArrowLeftRight },
  { to: '/expenses', label: 'Expenses', Icon: Receipt },
  { to: '/settlements', label: 'Settlements', Icon: Scale },
  { to: '/transport', label: 'Transport', Icon: Plane },
  { to: '/accommodation', label: 'Stays', Icon: BedDouble },
  { to: '/deposits', label: 'Deposits', Icon: Bookmark },
  { to: '/announcements', label: 'Updates', Icon: Megaphone },
  { to: '/polls', label: 'Polls', Icon: BarChart2 },
];

export default function Sidebar() {
  const { currentTrip, clearSession } = useTrip();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-sidebar text-white border-r border-sidebar-border">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center flex-shrink-0">
              <Plane size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-sm font-600 text-white leading-tight tracking-tight">
                Trip Planner
              </h1>
              {currentTrip && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {currentTrip.destination}
                </p>
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
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-body font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-navy/20 text-blue-400 border-l-2 border-blue-400 pl-[10px]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-l-2 border-transparent pl-[10px]'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.75} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <button
            onClick={clearSession}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 font-body"
          >
            <LogOut size={15} strokeWidth={1.75} />
            Leave Trip
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border flex safe-area-bottom">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 transition-colors duration-150 ${
                isActive ? 'text-blue-400' : 'text-slate-500'
              }`
            }
          >
            <Icon size={18} strokeWidth={1.75} className="mb-0.5" />
            <span className="text-[9px] font-body font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
