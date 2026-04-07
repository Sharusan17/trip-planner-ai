import { Routes, Route, Navigate } from 'react-router-dom';
import { useTrip } from './context/TripContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import TravellersPage from './pages/TravellersPage';
import ItineraryPage from './pages/ItineraryPage';
import MapPage from './pages/MapPage';
import WeatherPage from './pages/WeatherPage';
import CurrencyPage from './pages/CurrencyPage';

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
        <Route path="/weather" element={<WeatherPage />} />
        <Route path="/currency" element={<CurrencyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
