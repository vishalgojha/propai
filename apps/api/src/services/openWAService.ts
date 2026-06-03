import { sessionManager } from '../whatsapp/SessionManager';

type SendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

function asErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

async function getSystemSession() {
  return sessionManager.getSession('system', 'System');
}

async function sendText(chatId: string, text: string): Promise<SendResult> {
  try {
    const client = await getSystemSession();
    if (!client) {
      return { success: false, error: 'System WhatsApp session is not connected' };
    }

    const result = await client.sendText(chatId, text);
    const messageId = String((result as any)?.key?.id || (result as any)?.id || '');
    return { success: true, messageId: messageId || undefined };
  } catch (error) {
    return { success: false, error: asErrorMessage(error, 'Failed to send WhatsApp message') };
  }
}

async function sendWithFallback(chatId: string, text: string, mediaUrl?: string | null): Promise<SendResult> {
  try {
    const client = await getSystemSession();
    if (!client) {
      return { success: false, error: 'System WhatsApp session is not connected' };
    }

    if (mediaUrl) {
      const result = await client.sendMedia(chatId, {
        url: mediaUrl,
        caption: text,
      });
      const messageId = String((result as any)?.key?.id || (result as any)?.id || '');
      return { success: true, messageId: messageId || undefined };
    }

    return sendText(chatId, text);
  } catch (error) {
    return { success: false, error: asErrorMessage(error, 'Failed to send WhatsApp message') };
  }
}

export const openWAService = {
  healthCheck: async (): Promise<boolean> => {
    try {
      const status = await sessionManager.getSystemStatus();
      return Boolean(status.connected);
    } catch {
      return false;
    }
  },

  getSessionStatus: async (): Promise<{ status: string; connected: boolean }> => {
    try {
      return await sessionManager.getSystemStatus();
    } catch {
      return { status: 'disconnected', connected: false };
    }
  },

  getQRCode: async (): Promise<string | null> => {
    try {
      return sessionManager.getSystemQR();
    } catch {
      return null;
    }
  },

  sendText,
  sendWithFallback,
};
