import { useState, useRef, useCallback } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expenseClaimsApi } from '@/api/expenseClaims';
import { Plane, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import TripHeader from './TripHeader';

function PendingClaimsBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTrip, activeTraveller } = useTrip();

  const { data: pendingClaims = [] } = useQuery({
    queryKey: ['claims', 'pending', currentTrip?.id, activeTraveller?.id],
    queryFn: () => expenseClaimsApi.listPending(currentTrip!.id, activeTraveller!.id),
    enabled: !!currentTrip && !!activeTraveller,
    refetchInterval: 20_000,
    staleTime: 0,
  });

  // Hide only on pages that fully replace this banner with their own UI
  const onReviewPage = location.pathname.startsWith('/expenses/claims');
  const onDashboard = location.pathname === '/dashboard' || location.pathname === '/';
  if (pendingClaims.length === 0 || onReviewPage || onDashboard) return null;

  return (
    <button
      onClick={() => navigate('/expenses/claims')}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
      style={{ backgroundColor: '#f59e0b', color: '#1c1917' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d97706')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f59e0b')}
    >
      <span className="text-lg flex-shrink-0">📋</span>
      <div className="flex-1 min-w-0">
        <span className="font-bold text-sm">
          {pendingClaims.length} expense claim{pendingClaims.length !== 1 ? 's' : ''} need{pendingClaims.length === 1 ? 's' : ''} your review
        </span>
        <span className="text-xs ml-2 opacity-80">
          — tap to pick what you owe
        </span>
      </div>
      <span className="text-sm font-bold flex-shrink-0 opacity-80">Review →</span>
    </button>
  );
}

export default function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const handleScroll = useCallback(() => {
    setScrolled((mainRef.current?.scrollTop ?? 0) > 50);
  }, []);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-parchment">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main
        ref={mainRef}
        onScroll={handleScroll}
        className="flex-1 flex flex-col overflow-auto min-w-0 max-w-full"
      >
        <div className="sticky top-0 z-10 bg-parchment px-4 pt-4 md:px-6 md:pt-6">
          {/* Collapsed header — mobile only, shown after scrolling 50px */}
          <div
            className={`md:hidden mb-4 transition-all duration-300 ease-out overflow-hidden ${
              scrolled ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0 mb-0'
            }`}
          >
            <div className="bg-white border border-parchment-dark rounded-2xl px-3 py-2.5 shadow-[var(--shadow-card)] flex items-center gap-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#1C1917] text-white flex items-center justify-center shadow-sm"
              >
                <Menu size={18} strokeWidth={2} />
              </button>
              <div className="w-8 h-8 rounded-xl bg-[#1C1917] flex items-center justify-center flex-shrink-0 shadow-sm">
                <Plane size={15} className="text-white" strokeWidth={1.75} />
              </div>
            </div>
          </div>

          {/* Full header — hidden on mobile once scrolled */}
          <div
            className={`transition-all duration-300 ease-out overflow-hidden ${
              scrolled ? 'md:block max-h-0 opacity-0 md:max-h-40 md:opacity-100' : 'max-h-40 opacity-100'
            }`}
          >
            <TripHeader onMenuOpen={() => setMobileNavOpen(true)} />
            <PendingClaimsBanner />
          </div>
        </div>
        <div className="flex-1 p-4 md:p-6 pt-0 md:pt-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
