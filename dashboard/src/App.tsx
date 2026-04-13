import { Routes, Route, Navigate } from 'react-router-dom';
import { useTrip } from './context/TripContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import TravellersPage from './pages/TravellersPage';
import ItineraryPage from './pages/ItineraryPage';
import MapPage from './pages/MapPage';
import ExpensesPage from './pages/ExpensesPage';
import LogisticsPage from './pages/LogisticsPage';
import CommunityPage from './pages/CommunityPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentTrip, restoring } = useTrip();
  if (restoring) return (
    <div className="min-h-screen flex items-center justify-center bg-parchment">
      <div className="w-8 h-8 rounded-full border-2 border-navy border-t-transparent animate-spin" />
    </div>
  );
  if (!currentTrip) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard"      element={<DashboardPage />} />
        <Route path="/travellers"     element={<TravellersPage />} />
        <Route path="/itinerary"      element={<ItineraryPage />} />
        <Route path="/map"            element={<MapPage />} />
        <Route path="/expenses"       element={<ExpensesPage />} />
        <Route path="/logistics"      element={<LogisticsPage />} />
        <Route path="/community"      element={<CommunityPage />} />

        {/* Legacy redirects */}
        <Route path="/currency"       element={<Navigate to="/expenses" replace />} />
        <Route path="/settlements"    element={<Navigate to="/expenses" replace />} />
        <Route path="/deposits"       element={<Navigate to="/expenses" replace />} />
        <Route path="/transport"      element={<Navigate to="/logistics" replace />} />
        <Route path="/accommodation"  element={<Navigate to="/logistics" replace />} />
        <Route path="/announcements"  element={<Navigate to="/community" replace />} />
        <Route path="/polls"          element={<Navigate to="/community" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
