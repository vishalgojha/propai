import posthog from 'posthog-js';

const posthogKey = (import.meta as any).env.VITE_POSTHOG_KEY;
const posthogHost = (import.meta as any).env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized || !posthogKey) return;

  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false,
    persistence: 'localStorage',
    autocapture: false,
    disable_session_recording: false,
  });

  initialized = true;
}

export function track(event: string, properties: Record<string, unknown> = {}) {
  if (!posthogKey) return;
  initAnalytics();
  posthog.capture(event, properties);
}

export function identify(userId: string, properties: Record<string, unknown> = {}) {
  if (!posthogKey) return;
  initAnalytics();
  posthog.identify(userId, properties);
}

export function resetAnalytics() {
  if (!posthogKey) return;
  initAnalytics();
  posthog.reset();
}
