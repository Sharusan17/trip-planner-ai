import { NavLink } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '🧭' },
  { to: '/travellers', label: 'Travellers', icon: '👥' },
  { to: '/itinerary', label: 'Itinerary', icon: '📋' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/weather', label: 'Weather', icon: '☀️' },
  { to: '/currency', label: 'Currency', icon: '💱' },
  { to: '/expenses', label: 'Expenses', icon: '💰' },
  { to: '/settlements', label: 'Settlements', icon: '⚖️' },
  { to: '/transport', label: 'Transport', icon: '✈️' },
  { to: '/accommodation', label: 'Stays', icon: '🏨' },
  { to: '/deposits', label: 'Deposits', icon: '🔖' },
];

export default function Sidebar() {
  const { currentTrip, clearSession } = useTrip();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-navy text-parchment-light border-r border-gold/20">
        <div className="p-5 border-b border-gold/20">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧭</span>
            <div>
              <h1 className="font-display text-lg font-bold text-gold-light leading-tight">
                Holiday Planner
              </h1>
              {currentTrip && (
                <p className="text-xs text-parchment-dark/70 mt-0.5 truncate">
                  {currentTrip.destination}
                </p>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-sm font-display text-sm transition-all ${
                  isActive
                    ? 'bg-gold/20 text-gold-light border-l-2 border-gold'
                    : 'text-parchment-dark/80 hover:bg-parchment/10 hover:text-parchment-light'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gold/20">
          <button
            onClick={clearSession}
            className="w-full text-left px-3 py-2 text-xs text-parchment-dark/60 hover:text-terracotta-light transition-colors font-display"
          >
            Leave Trip
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy border-t border-gold/20 flex">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs font-display transition-colors ${
                isActive
                  ? 'text-gold-light'
                  : 'text-parchment-dark/60'
              }`
            }
          >
            <span className="text-lg mb-0.5">{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
