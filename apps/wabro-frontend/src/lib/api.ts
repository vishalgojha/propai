const getPassword = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('wa_password');
};

export interface StatusData {
  connected: boolean;
  error: string;
  qr: string | null;
  contacts: number;
  groups: number;
  broadcast: {
    running: boolean;
    started: number;
    total?: number;
    sent?: number;
    failed?: number;
  };
}

export interface Contact {
  jid: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  participants: string[];
}

export interface BroadcastResponse {
  started?: boolean;
  total?: number;
  estimatedTime?: string;
  error?: string;
}

export interface ConnectResponse {
  status: 'connected' | 'qr' | 'code';
  qr?: string;
  code?: string;
  error?: string;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return res;
}

export async function getStatus(): Promise<StatusData> {
  const res = await apiFetch('/api/status');
  return res.json();
}

export async function connectWhatsApp(phoneNumber?: string): Promise<ConnectResponse> {
  const res = await apiFetch('/api/connect', {
    method: 'POST',
    body: JSON.stringify(phoneNumber ? { phoneNumber } : {}),
  });
  return res.json();
}

export async function testConnection(password: string): Promise<{ success?: boolean; message?: string; error?: string }> {
  const res = await apiFetch('/api/test', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  return res.json();
}

export async function getContacts(): Promise<Contact[]> {
  const res = await apiFetch('/api/contacts');
  return res.json();
}

export async function getGroups(): Promise<Group[]> {
  const res = await apiFetch('/api/groups');
  return res.json();
}

export async function startBroadcast(data: {
  numbers?: string[];
  message: string;
  password: string;
  csvData?: string;
  groupIds?: string[];
  speedMode: 'fast' | 'safe' | 'ultra';
}): Promise<BroadcastResponse> {
  const res = await apiFetch('/api/broadcast', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}
