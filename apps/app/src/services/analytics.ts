const posthogKey = (import.meta as any).env.VITE_POSTHOG_KEY;
const posthogHost = (import.meta as any).env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;
let posthogClientPromise: Promise<typeof import('posthog-js').default | null> | null = null;

async function getPosthog() {
  if (!posthogKey) {
    return null;
  }

  if (!posthogClientPromise) {
    posthogClientPromise = import('posthog-js').then((module) => module.default);
  }

  return posthogClientPromise;
}

export async function initAnalytics() {
  if (initialized || !posthogKey) return;

  const posthog = await getPosthog();
  if (!posthog) {
    return;
  }

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
  void (async () => {
    const posthog = await getPosthog();
    if (!posthog) {
      return;
    }
    await initAnalytics();
    posthog.capture(event, properties);
  })();
}

export function identify(userId: string, properties: Record<string, unknown> = {}) {
  if (!posthogKey) return;
  void (async () => {
    const posthog = await getPosthog();
    if (!posthog) {
      return;
    }
    await initAnalytics();
    posthog.identify(userId, properties);
  })();
}

export function resetAnalytics() {
  if (!posthogKey) return;
  void (async () => {
    const posthog = await getPosthog();
    if (!posthog) {
      return;
    }
    await initAnalytics();
    posthog.reset();
  })();
}
