import { Request, Response } from 'express';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';

export const connectWhatsApp = async (req: Request, res: Response) => {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    try {
        await sessionManager.createSession(
            tenantId, 
            () => {}, // QR handled in SessionManager
            () => {}  // Connection update handled in SessionManager
        );
        res.json({ message: 'Connection initiated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getQR = async (req: Request, res: Response) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const qr = sessionManager.getQR(tenantId as string);
    if (!qr) return res.status(404).json({ error: 'QR code not available' });

    res.json({ qr });
};

export const getStatus = async (req: Request, res: Response) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('status')
        .eq('tenant_id', tenantId)
        .single();

    if (error || !data) return res.status(404).json({ status: 'disconnected' });

    res.json({ status: data.status });
};

export const disconnectWhatsApp = async (req: Request, res: Response) => {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    try {
        await sessionManager.removeSession(tenantId);
        res.json({ message: 'Disconnected successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getMessages = async (req: Request, res: Response) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
};

export const sendMessage = async (req: Request, res: Response) => {
    const { tenantId, remoteJid, text } = req.body;
    if (!tenantId || !remoteJid || !text) {
        return res.status(400).json({ error: 'tenantId, remoteJid, and text are required' });
    }

    try {
        const client = await sessionManager.getSession(tenantId);
        if (!client) {
            return res.status(404).json({ error: 'No active WhatsApp session found' });
        }

        await (client as any).sendText(remoteJid, text);
        
        res.json({ message: 'Message sent successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
