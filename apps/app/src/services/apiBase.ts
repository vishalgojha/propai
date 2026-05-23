function getRuntimeApiBase() {
  if (typeof window === 'undefined') {
    return 'http://localhost:3001/api';
  }

  const { hostname, protocol } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }

  if (hostname.endsWith('propai.live')) {
    const apiHost = hostname.startsWith('app.') ? 'api.' + hostname.slice(4) : hostname;
    return `${protocol}//${apiHost}/api`;
  }

  return `${window.location.origin}/api`;
}

function normalizeApiBase(value?: string | null) {
  const fallback = getRuntimeApiBase();
  const raw = String(value || '').trim() || fallback;

  if (typeof window === 'undefined') {
    return raw;
  }

  try {
    const url = new URL(raw, window.location.origin);
    const isLocalApi = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    if (window.location.protocol === 'https:' && url.protocol === 'http:' && !isLocalApi) {
      url.protocol = 'https:';
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

export const backendApiUrl = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE_URL);
