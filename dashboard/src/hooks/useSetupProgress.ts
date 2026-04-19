import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import { accommodationApi } from '@/api/accommodation';
import { transportApi } from '@/api/transport';
import { itineraryApi } from '@/api/itinerary';

const DISMISS_KEY_PREFIX = 'trip-planner-ai-setup-dismissed-';

export interface SetupProgress {
  travellersCount: number;
  staysCount: number;
  transportCount: number;
  activitiesCount: number;
  sectionsDone: number;
  totalSections: number;
  allComplete: boolean;
  dismissed: boolean;
  dismiss: () => void;
  undismiss: () => void;
  firstIncompleteStep: number; // 0-indexed: 0=travellers, 1=stays, 2=transport, 3=activities
  isLoading: boolean;
}

/**
 * Tracks which onboarding sections the organiser has filled for the current trip.
 *
 * A section is "done" when it has ≥ 1 item — with one exception: Travellers is
 * considered done at > 1, because the organiser is auto-added on trip create
 * (so a count of 1 means they haven't added anyone else yet).
 */
export function useSetupProgress(): SetupProgress {
  const { currentTrip } = useTrip();
  const tripId = currentTrip?.id;
  const dismissKey = tripId ? `${DISMISS_KEY_PREFIX}${tripId}` : null;

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!dismissKey) return false;
    return localStorage.getItem(dismissKey) === '1';
  });

  // Re-read dismiss flag whenever the trip id changes
  useEffect(() => {
    if (!dismissKey) { setDismissed(false); return; }
    setDismissed(localStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  const travellersQ = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId!),
    enabled: !!tripId,
  });

  const staysQ = useQuery({
    queryKey: ['accommodation', tripId],
    queryFn: () => accommodationApi.list(tripId!),
    enabled: !!tripId,
  });

  const transportQ = useQuery({
    queryKey: ['transport', tripId],
    queryFn: () => transportApi.list(tripId!),
    enabled: !!tripId,
  });

  const daysQ = useQuery({
    queryKey: ['days', tripId],
    queryFn: () => itineraryApi.getDays(tripId!),
    enabled: !!tripId,
  });

  const travellersCount = travellersQ.data?.length ?? 0;
  const staysCount = staysQ.data?.length ?? 0;
  const transportCount = transportQ.data?.length ?? 0;
  const activitiesCount = (daysQ.data ?? []).reduce(
    (sum, d) => sum + (d.activities?.length ?? 0),
    0,
  );

  // Travellers step is done when the organiser has added at least one *other*
  // traveller (count > 1), since they are auto-added on trip create.
  const done = [
    travellersCount > 1,
    staysCount >= 1,
    transportCount >= 1,
    activitiesCount >= 1,
  ];
  const sectionsDone = done.filter(Boolean).length;
  const firstIncompleteStep = done.findIndex((d) => !d);

  const dismiss = () => {
    if (!dismissKey) return;
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };
  const undismiss = () => {
    if (!dismissKey) return;
    localStorage.removeItem(dismissKey);
    setDismissed(false);
  };

  return {
    travellersCount,
    staysCount,
    transportCount,
    activitiesCount,
    sectionsDone,
    totalSections: 4,
    allComplete: sectionsDone === 4,
    dismissed,
    dismiss,
    undismiss,
    firstIncompleteStep: firstIncompleteStep === -1 ? 0 : firstIncompleteStep,
    isLoading:
      travellersQ.isLoading || staysQ.isLoading || transportQ.isLoading || daysQ.isLoading,
  };
}
