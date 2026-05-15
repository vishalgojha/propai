import { Request, Response } from 'express';
import { supabaseAdmin, createSupabaseServiceClient } from '../config/supabase';
import { isOwnerSuperAdminEmail, getErrorMessage } from '../utils/controllerHelpers';
import { embedText } from '../services/embeddingService';
import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.join(__dirname, '../../scraper_status.json');

function readStatus(): any {
    try {
        return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

function writeStatus(data: any) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
}

function isAuthorized(req: Request, admin: any): boolean {
    const serviceKey = (req.headers['x-service-key'] as string || '').trim();
    if (serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) return true;

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return false;

    // validated by authMiddleware already — just check super admin
    const user = (req as any).user;
    if (!user) return false;
    const email = String(user?.email || '').trim().toLowerCase();
    if (isOwnerSuperAdminEmail(email)) return true;
    return false;
}

export const heartbeat = async (req: Request, res: Response) => {
    try {
        const { status, stats, chats_count, last_message_at } = req.body;
        writeStatus({
            status: status || 'running',
            stats: stats || null,
            chats_count: chats_count || 0,
            last_message_at: last_message_at || null,
            last_heartbeat: new Date().toISOString(),
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: getErrorMessage(error, 'Heartbeat failed') });
    }
};

export const getStatus = async (req: Request, res: Response) => {
    const admin = supabaseAdmin || createSupabaseServiceClient();
    if (!admin) return res.status(503).json({ success: false, error: 'Supabase not configured' });
    if (!isAuthorized(req, admin)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const scraper = readStatus();
    // Get total listings count from DB
    let total_listings = 0;
    try {
        const { count } = await admin.from('listings').select('*', { count: 'exact', head: true });
        total_listings = count || 0;
    } catch {}

    res.json({
        success: true,
        scraper,
        total_listings,
    });
};

export const semanticSearch = async (req: Request, res: Response) => {
    try {
        const admin = supabaseAdmin || createSupabaseServiceClient();
        if (!admin) return res.status(503).json({ success: false, error: 'Supabase not configured' });
        if (!isAuthorized(req, admin)) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const { query, locality, bhk, type, threshold, limit } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, error: 'query (string) is required' });
        }

        // Generate query embedding via Transformers.js
        let embedding: number[];
        try {
            embedding = await embedText(query);
        } catch (e: any) {
            return res.status(503).json({ success: false, error: `Embedding model unavailable: ${e.message}` });
        }

        const { data, error } = await admin.rpc('match_listings', {
            query_embedding: embedding,
            match_threshold: threshold ?? 0.6,
            match_count: limit ?? 20,
            p_tenant_id: req.body.tenant_id || null,
            p_locality: locality || null,
            p_bhk: bhk || null,
            p_type: type || null,
        });

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({ success: true, results: data || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: getErrorMessage(error, 'Semantic search failed') });
    }
};

export const generateEmbedding = async (req: Request, res: Response) => {
    try {
        const admin = supabaseAdmin || createSupabaseServiceClient();
        if (!admin) return res.status(503).json({ success: false, error: 'Supabase not configured' });
        if (!isAuthorized(req, admin)) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const { text } = req.body;
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ success: false, error: 'text (string) is required' });
        }
        const embedding = await embedText(text);
        res.json({ success: true, embedding });
    } catch (error: any) {
        res.status(500).json({ success: false, error: getErrorMessage(error, 'Embedding failed') });
    }
};

export const marketStats = async (req: Request, res: Response) => {
    try {
        const admin = supabaseAdmin || createSupabaseServiceClient();
        if (!admin) return res.status(503).json({ success: false, error: 'Supabase not configured' });
        if (!isAuthorized(req, admin)) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const { locality, days } = req.query;
        const { data, error } = await admin.rpc('market_stats', {
            p_locality: (locality as string) || null,
            p_days: days ? parseInt(days as string, 10) : 30,
        });

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({ success: true, results: data || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: getErrorMessage(error, 'Market stats failed') });
    }
};
