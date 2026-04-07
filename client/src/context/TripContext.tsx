import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Trip, Traveller } from '@trip-planner-ai/shared';

interface TripState {
  currentTrip: Trip | null;
  activeTraveller: Traveller | null;
  setCurrentTrip: (trip: Trip | null) => void;
  setActiveTraveller: (traveller: Traveller | null) => void;
  isOrganiser: boolean;
  clearSession: () => void;
}

const TripContext = createContext<TripState | null>(null);

const STORAGE_KEY = 'plan-holiday-session';

interface StoredSession {
  tripId: string;
  travellerId: string;
}

export function TripProvider({ children }: { children: ReactNode }) {
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [activeTraveller, setActiveTraveller] = useState<Traveller | null>(null);

  // Persist session to localStorage
  useEffect(() => {
    if (currentTrip && activeTraveller) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tripId: currentTrip.id,
        travellerId: activeTraveller.id,
      }));
    }
  }, [currentTrip, activeTraveller]);

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentTrip(null);
    setActiveTraveller(null);
  };

  const isOrganiser = activeTraveller?.role === 'organiser';

  return (
    <TripContext.Provider value={{
      currentTrip,
      activeTraveller,
      setCurrentTrip,
      setActiveTraveller,
      isOrganiser,
      clearSession,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}

export function getStoredSession(): StoredSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}
