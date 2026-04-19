import { Request, Response } from 'express';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';

export const connectWhatsApp = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { phoneNumber, label, ownerName } = req.body;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    try {
        await sessionManager.createSession(
            tenantId, 
            () => {}, 
            () => {},
            { 
                usePairingCode: phoneNumber, 
                label: label || 'Owner', 
                ownerName: ownerName 
            }
        );
        res.json({ message: 'Connection initiated' });
    } catch (error: any) {
        console.error('Connect Error:', error);
        res.status(500).json({ error: error.message || 'Could not start connection. Please try again.' });
    }
};


export const getQR = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const qr = sessionManager.getQR(tenantId as string);
    if (!qr) return res.status(404).json({ error: 'Code not ready yet' });

    res.json({ qr });
};

export const getStatus = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('status')
        .eq('tenant_id', tenantId)
        .single();

    if (error || !data) return res.status(404).json({ status: 'disconnected' });

    res.json({ status: data.status });
};

export const disconnectWhatsApp = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    try {
        await sessionManager.removeSession(tenantId);
        res.json({ message: 'Disconnected successfully' });
    } catch (error: any) {
        console.error('Disconnect Error:', error);
        res.status(500).json({ error: 'Could not disconnect. Please try again.' });
    }
};

export const getMessages = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
};

export const sendMessage = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { remoteJid, text } = req.body;
    if (!tenantId || !remoteJid || !text) {
        return res.status(400).json({ error: 'remoteJid and text are required' });
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
