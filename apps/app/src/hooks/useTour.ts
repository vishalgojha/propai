import React from 'react';

const TOUR_COMPLETED_KEY = 'propai.tour_v1_completed';

export function useTour(userId?: string | null) {
  const storageKey = userId ? `${TOUR_COMPLETED_KEY}.${userId}` : TOUR_COMPLETED_KEY;

  const [isCompleted, setIsCompleted] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      setIsCompleted(window.localStorage.getItem(storageKey) === 'true');
    } catch {
      setIsCompleted(false);
    }
  }, [storageKey]);

  const markCompleted = React.useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, 'true');
    } catch {
      // Ignore storage failures.
    }
    setIsCompleted(true);
  }, [storageKey]);

  const resetTour = React.useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures.
    }
    setIsCompleted(false);
  }, [storageKey]);

  return { isCompleted, markCompleted, resetTour };
}
