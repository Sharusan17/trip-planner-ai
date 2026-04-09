import { Routes, Route, Navigate } from 'react-router-dom';
import { useTrip } from './context/TripContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import TravellersPage from './pages/TravellersPage';
import ItineraryPage from './pages/ItineraryPage';
import MapPage from './pages/MapPage';
import CurrencyPage from './pages/CurrencyPage';
import ExpensesPage from './pages/ExpensesPage';
import SettlementsPage from './pages/SettlementsPage';
import TransportPage from './pages/TransportPage';
import AccommodationPage from './pages/AccommodationPage';
import DepositsPage from './pages/DepositsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import PollsPage from './pages/PollsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentTrip } = useTrip();
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/travellers" element={<TravellersPage />} />
        <Route path="/itinerary" element={<ItineraryPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/currency" element={<CurrencyPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/transport" element={<TransportPage />} />
        <Route path="/accommodation" element={<AccommodationPage />} />
        <Route path="/deposits" element={<DepositsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/polls" element={<PollsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
