import React from 'react';
import { deleteCookie, readCookie, writeCookie } from '../services/browserCookies';

const TOUR_COMPLETED_KEY = 'propai.tour_v1_completed';
const TOUR_COMPLETED_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function useTour(userId?: string | null) {
  const storageKey = userId ? `${TOUR_COMPLETED_KEY}.${userId}` : TOUR_COMPLETED_KEY;

  const [isCompleted, setIsCompleted] = React.useState(() => {
    return readCookie(storageKey) === 'true';
  });

  React.useEffect(() => {
    setIsCompleted(readCookie(storageKey) === 'true');
  }, [storageKey]);

  const markCompleted = React.useCallback(() => {
    writeCookie(storageKey, 'true', { maxAge: TOUR_COMPLETED_MAX_AGE_SECONDS });
    setIsCompleted(true);
  }, [storageKey]);

  const resetTour = React.useCallback(() => {
    deleteCookie(storageKey);
    setIsCompleted(false);
  }, [storageKey]);

  return { isCompleted, markCompleted, resetTour };
}
