import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TripHeader from './TripHeader';

export default function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 pt-16 md:pt-6 overflow-auto min-w-0">
        <TripHeader />
        <Outlet />
      </main>
    </div>
  );
}
