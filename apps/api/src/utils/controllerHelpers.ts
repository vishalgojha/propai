import { Request } from 'express';
import { supabaseAdmin } from '../config/supabase';
import '../types/express';

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'chariotrealty@gmail.com',
  'hello@chaoscraftlabs.com',
  'ojha007@gmail.com',
  'hello@propai.live',
]);

export function isOwnerSuperAdminEmail(email?: string | null) {
  return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

export function getTenantId(req: Request) {
  const user = req.user;
  return String(user?.id || 'system');
}

export async function requireSuperAdmin(req: Request) {
  const user = req.user;
  const email = String(user?.email || '').trim().toLowerCase();

  if (isOwnerSuperAdminEmail(email)) return;

  if (!supabaseAdmin) {
    throw new HttpError('Supabase admin unavailable', 503);
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('app_role')
    .eq('id', user?.id)
    .maybeSingle();

  if (error) throw error;

  if (data?.app_role !== 'super_admin' && data?.app_role !== 'admin') {
    throw new HttpError('Super admin access required', 403);
  }
}

export function getAdminInfo(req: Request) {
  const user = req.user;
  return {
    adminId: String(user?.id || ''),
    adminEmail: String(user?.email || ''),
  };
}

export class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    const directMessage = typeof candidate.message === 'string' ? candidate.message.trim() : '';
    if (directMessage) {
      return directMessage;
    }

    const nestedError = candidate.error;
    if (typeof nestedError === 'string' && nestedError.trim()) {
      return nestedError.trim();
    }

    if (nestedError && typeof nestedError === 'object') {
      const nestedMessage = typeof (nestedError as Record<string, unknown>).message === 'string'
        ? String((nestedError as Record<string, unknown>).message).trim()
        : '';
      if (nestedMessage) {
        return nestedMessage;
      }
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}' && serialized !== 'null') {
        return serialized;
      }
    } catch {
      // Ignore stringify failures and use the fallback below.
    }
  }

  const stringified = String(error || '').trim();
  return stringified && stringified !== '[object Object]' ? stringified : fallback;
}

export function getErrorStatus(error: unknown, fallback = 500): number {
  if (error instanceof HttpError) return error.statusCode;
  return fallback;
}
