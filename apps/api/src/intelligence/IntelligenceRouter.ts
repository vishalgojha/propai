import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { intelligenceAPI } from '../services/IntelligenceAPI';
import { supabase } from '../config/supabase';

const router = Router();

router.get('/stream', authMiddleware, async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours || 24), 1), 168);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const city = String(req.query.city || '').trim();
  const since = new Date(Date.now() - hours * 3600000).toISOString();

  try {
    let query = supabase
      .from('public_listings')
      .select('source_message_id, source_group_name, listing_type, title, description, location, area, sub_area, price, price_type, size_sqft, bhk, property_type, primary_contact_name, primary_contact_number, primary_contact_wa, message_timestamp, created_at')
      .gte('message_timestamp', since)
      .order('message_timestamp', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (city) {
      query = query.or(`location.ilike.%${city}%,area.ilike.%${city}%,sub_area.ilike.%${city}%`);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to load stream' });
    }

    return res.json({ success: true, items: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load stream' });
  }
});

router.get('/igr/building', authMiddleware, async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const data = await intelligenceAPI.getLastTransactionForBuilding(name);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to query IGR building transaction' });
  }
});

router.get('/igr/locality', authMiddleware, async (req, res) => {
  const name = String(req.query.name || '').trim();
  const months = Number(req.query.months || 6);

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const data = await intelligenceAPI.getLocalityStats(name, Number.isFinite(months) ? months : 6);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to query IGR locality stats' });
  }
});

export default router;
