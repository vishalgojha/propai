import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin!;

export async function listBrokers(req: Request, res: Response) {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;
    const sort = (req.query.sort as string) || 'total_messages';

    let query = db
        .from('broker_activity')
        .select('*', { count: 'exact' });

    if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query
        .order(sort, { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, count, limit, offset });
}

export async function getBroker(req: Request, res: Response) {
    const phone = req.params.phone;
    const { data, error } = await db
        .from('broker_activity')
        .select('*')
        .eq('phone', phone)
        .single();

    if (error) return res.status(404).json({ error: 'Broker not found' });
    res.json({ data });
}

export async function getBrokerListings(req: Request, res: Response) {
    const phone = req.params.phone;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { data, error, count } = await db
        .from('public_listings')
        .select('*', { count: 'exact' })
        .eq('sender_number', phone)
        .order('message_timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, count, limit, offset });
}
