import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TripHeader from './TripHeader';

export default function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
        <TripHeader />
        <Outlet />
      </main>
    </div>
  );
}
