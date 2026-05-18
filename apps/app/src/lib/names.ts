export function splitFullName(fullName?: string | null) {
  const normalized = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return { firstName: '', lastName: '' };

  const [firstName = '', ...rest] = normalized.split(' ');
  return {
    firstName,
    lastName: rest.join(' ').trim(),
  };
}

export function buildFullName(firstName?: string | null, lastName?: string | null) {
  return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ');
}

export function getPreferredName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
}) {
  const composed = buildFullName(input.firstName, input.lastName);
  if (composed) return composed;

  const normalizedFullName = String(input.fullName || '').replace(/\s+/g, ' ').trim();
  if (normalizedFullName) return normalizedFullName;

  return String(input.email || '').split('@')[0]?.trim() || '';
}
