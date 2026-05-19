import crypto from 'crypto';

const TOKEN_PREFIX = 'wabro_dev_';

export function generateWabroDeviceToken(): string {
  return `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
}

export function hashWabroDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function maskWabroDeviceToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}
