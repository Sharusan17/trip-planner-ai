import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { expenseClaimsApi } from '@/api/expenseClaims';
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
  });

  // Hide banner when already on the review page
  const onReviewPage = location.pathname.startsWith('/expenses/claims');
  if (pendingClaims.length === 0 || onReviewPage) return null;

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
  return (
    <div className="flex min-h-screen bg-parchment">
      <Sidebar />
      <main className="flex-1 flex flex-col pt-16 md:pt-0 overflow-auto min-w-0 max-w-full">
        <TripHeader />
        <PendingClaimsBanner />
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
