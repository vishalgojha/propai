export const SESSION_COOKIE_NAME = 'propai_session';

export type SessionRole = 'broker' | 'superadmin';

export function isValidSessionRole(value: string | undefined | null): value is SessionRole {
  return value === 'broker' || value === 'superadmin';
}
