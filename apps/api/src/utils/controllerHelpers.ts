import { Request } from 'express';
import { supabaseAdmin } from '../config/supabase';
import '../types/express';

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
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

  if (data?.app_role !== 'super_admin') {
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
  return String(error) || fallback;
}

export function getErrorStatus(error: unknown, fallback = 500): number {
  if (error instanceof HttpError) return error.statusCode;
  return fallback;
}
