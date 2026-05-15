import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

export async function listFlaggedParses(req: Request, res: Response) {
  const status = (req.query.status as string) || 'pending';
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  const { data, error, count } = await (supabaseAdmin || supabaseAdmin!)
    .from('flagged_parses')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, count, limit, offset });
}

export async function reviewFlaggedParse(req: Request, res: Response) {
  const id = req.params.id;
  const { status, review_notes } = req.body;

  if (!['reviewed', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "reviewed" or "dismissed"' });
  }

  const { error } = await (supabaseAdmin || supabaseAdmin!)
    .from('flagged_parses')
    .update({
      status,
      review_notes: review_notes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
}

export async function flaggedStats(req: Request, res: Response) {
  const { data, error } = await (supabaseAdmin || supabaseAdmin!)
    .from('flagged_parses')
    .select('status, count');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
}
