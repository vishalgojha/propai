import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { hashWabroDeviceToken } from '../services/wabroDeviceProvisioningService';

function readProvisioningToken(req: Request): string | null {
  const headerToken = String(req.headers['x-wabro-device-token'] || '').trim();
  if (headerToken) return headerToken;

  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const queryToken = String(req.query.token || '').trim();
  return queryToken || null;
}

export const wabroDeviceAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase is not configured on this deployment' });
  }

  const rawToken = readProvisioningToken(req);
  if (!rawToken) {
    return res.status(401).json({ error: 'Missing WaBro device provisioning token' });
  }

  const tokenHash = hashWabroDeviceToken(rawToken);

  const { data: registration, error } = await supabaseAdmin!
    .from('wabro_device_registrations')
    .select('id, tenant_id, device_label, platform, status, expires_at, claimed_device_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Failed to resolve WaBro device token' });
  }

  if (!registration) {
    return res.status(401).json({ error: 'Invalid WaBro device provisioning token' });
  }

  if (registration.status === 'revoked') {
    return res.status(403).json({ error: 'WaBro device provisioning token has been revoked' });
  }

  if (registration.expires_at && new Date(registration.expires_at).getTime() < Date.now()) {
    return res.status(403).json({ error: 'WaBro device provisioning token has expired' });
  }

  (req as any).wabroDeviceContext = {
    registrationId: registration.id,
    tenantId: registration.tenant_id,
    deviceLabel: registration.device_label,
    platform: registration.platform,
    claimedDeviceId: registration.claimed_device_id,
  };

  const requestedDeviceId = String(req.params.deviceId || req.body?.device_id || req.body?.deviceName || '').trim();
  if (registration.claimed_device_id && requestedDeviceId && registration.claimed_device_id !== requestedDeviceId) {
    return res.status(403).json({ error: 'WaBro device provisioning token is already claimed by another device ID' });
  }

  next();
};
