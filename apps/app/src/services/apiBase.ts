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

export const backendApiUrl = (import.meta as any).env.VITE_API_BASE_URL || getRuntimeApiBase();
