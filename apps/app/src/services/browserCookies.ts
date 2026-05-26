type CookieOptions = {
  maxAge?: number;
  expires?: Date;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
  secure?: boolean;
};

function isBrowser() {
  return typeof document !== 'undefined';
}

function encodeValue(value: string) {
  return encodeURIComponent(value);
}

function decodeValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveSecureFlag(secure?: boolean) {
  if (typeof secure === 'boolean') {
    return secure;
  }

  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

export function readCookie(name: string) {
  if (!isBrowser()) return null;

  const prefix = `${name}=`;
  const entries = document.cookie ? document.cookie.split('; ') : [];

  for (const entry of entries) {
    if (entry.startsWith(prefix)) {
      return decodeValue(entry.slice(prefix.length));
    }
  }

  return null;
}

export function writeCookie(name: string, value: string, options: CookieOptions = {}) {
  if (!isBrowser()) return;

  const parts = [`${name}=${encodeValue(value)}`];
  parts.push(`Path=${options.path || '/'}`);

  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  parts.push(`SameSite=${options.sameSite || 'Lax'}`);

  if (resolveSecureFlag(options.secure)) {
    parts.push('Secure');
  }

  document.cookie = parts.join('; ');
}

export function deleteCookie(name: string, options: Pick<CookieOptions, 'path' | 'sameSite' | 'secure'> = {}) {
  writeCookie(name, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}

export function readJsonCookie<T>(name: string): T | null {
  const raw = readCookie(name);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonCookie<T>(name: string, value: T, options: CookieOptions = {}) {
  writeCookie(name, JSON.stringify(value), options);
}
