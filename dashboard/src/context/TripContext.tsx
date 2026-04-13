import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Trip, Traveller } from '@trip-planner-ai/shared';
import { tripsApi } from '../api/trips';
import { travellersApi } from '../api/travellers';

interface TripState {
  currentTrip: Trip | null;
  activeTraveller: Traveller | null;
  setCurrentTrip: (trip: Trip | null) => void;
  setActiveTraveller: (traveller: Traveller | null) => void;
  isOrganiser: boolean;
  clearSession: () => void;
  restoring: boolean;
}

const TripContext = createContext<TripState | null>(null);

const STORAGE_KEY = 'trip-planner-ai-session';

interface StoredSession {
  tripId: string;
  travellerId: string;
}

export function TripProvider({ children }: { children: ReactNode }) {
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [activeTraveller, setActiveTraveller] = useState<Traveller | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setRestoring(false);
      return;
    }
    Promise.all([
      tripsApi.getById(stored.tripId),
      travellersApi.list(stored.tripId),
    ])
      .then(([trip, travellers]) => {
        const traveller = travellers.find((t) => t.id === stored.travellerId);
        if (trip && traveller) {
          setCurrentTrip(trip);
          setActiveTraveller(traveller);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => setRestoring(false));
  }, []);

  // Persist session to localStorage whenever trip/traveller change
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
      restoring,
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
