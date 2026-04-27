import { Routes, Route, Navigate } from 'react-router-dom';
import { useTrip } from './context/TripContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import TravellersPage from './pages/TravellersPage';
import TravellerFormPage from './pages/TravellerFormPage';
import ItineraryPage from './pages/ItineraryPage';
import DayFormPage from './pages/DayFormPage';
import ActivityFormPage from './pages/ActivityFormPage';
import MapPage from './pages/MapPage';
import ExpensesPage from './pages/ExpensesPage';
import ExpenseFormPage from './pages/ExpenseFormPage';
import ExpenseClaimFormPage   from './pages/ExpenseClaimFormPage';
import ExpenseClaimReviewPage from './pages/ExpenseClaimReviewPage';
import DepositFormPage from './pages/DepositFormPage';
import LogisticsPage from './pages/LogisticsPage';
import TransportBookingFormPage from './pages/TransportBookingFormPage';
import VehicleFormPage from './pages/VehicleFormPage';
import AccommodationFormPage from './pages/AccommodationFormPage';
import CommunityPage from './pages/CommunityPage';
import AnnouncementFormPage from './pages/AnnouncementFormPage';
import PollFormPage from './pages/PollFormPage';
import PhotoUploadPage from './pages/PhotoUploadPage';
import TripSetupPage from './pages/TripSetupPage';
import TripSettingsPage from './pages/TripSettingsPage';
import ProfilePage from './pages/ProfilePage';
import FamilyFormPage from './pages/FamilyFormPage';

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
        <Route path="/setup"          element={<TripSetupPage />} />
        <Route path="/settings"       element={<TripSettingsPage />} />
        <Route path="/profile"        element={<ProfilePage />} />

        {/* Travellers */}
        <Route path="/travellers"              element={<TravellersPage />} />
        <Route path="/travellers/add"          element={<TravellerFormPage />} />
        <Route path="/travellers/:id/edit"     element={<TravellerFormPage />} />
        <Route path="/families/add"            element={<FamilyFormPage />} />
        <Route path="/families/:id/edit"       element={<FamilyFormPage />} />

        {/* Itinerary */}
        <Route path="/itinerary"                              element={<ItineraryPage />} />
        <Route path="/itinerary/days/add"                    element={<DayFormPage />} />
        <Route path="/itinerary/days/:dayId/activities/add"  element={<ActivityFormPage />} />
        <Route path="/itinerary/activities/:id/edit"         element={<ActivityFormPage />} />

        {/* Map */}
        <Route path="/map" element={<MapPage />} />

        {/* Expenses / Finance */}
        <Route path="/expenses"                element={<ExpensesPage />} />
        <Route path="/expenses/add"            element={<ExpenseFormPage />} />
        <Route path="/expenses/:id/edit"       element={<ExpenseFormPage />} />
        <Route path="/expenses/deposits/add"   element={<DepositFormPage />} />
        <Route path="/expenses/deposits/:id/edit" element={<DepositFormPage />} />
        <Route path="/expenses/claims/new"  element={<ExpenseClaimFormPage />} />
        <Route path="/expenses/claims"      element={<ExpenseClaimReviewPage />} />
        <Route path="/expenses/claims/:id"  element={<ExpenseClaimReviewPage />} />

        {/* Logistics */}
        <Route path="/logistics"                         element={<LogisticsPage />} />
        <Route path="/logistics/transport/add"           element={<TransportBookingFormPage />} />
        <Route path="/logistics/transport/:id/edit"      element={<TransportBookingFormPage />} />
        <Route path="/logistics/vehicles/add"            element={<VehicleFormPage />} />
        <Route path="/logistics/vehicles/:id/edit"       element={<VehicleFormPage />} />
        <Route path="/logistics/stays/add"               element={<AccommodationFormPage />} />
        <Route path="/logistics/stays/:id/edit"          element={<AccommodationFormPage />} />

        {/* Community */}
        <Route path="/community"                    element={<CommunityPage />} />
        <Route path="/community/announcements/new"  element={<AnnouncementFormPage />} />
        <Route path="/community/polls/new"          element={<PollFormPage />} />
        <Route path="/community/photos/upload"      element={<PhotoUploadPage />} />

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
