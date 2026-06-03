import axios from 'axios';

const OPENWA_BASE_URL = process.env.OPENWA_API_URL || 'http://localhost:2785';
const OPENWA_API_KEY = process.env.OPENWA_API_KEY || '';
const OPENWA_SESSION_NAME = process.env.OPENWA_SESSION_NAME || 'broadcast';

interface OpenWASendTextResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface OpenWASendMediaResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class OpenWAService {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (OPENWA_API_KEY) {
      headers['X-API-Key'] = OPENWA_API_KEY;
    }
    return headers;
  }

  private getApiUrl(path: string): string {
    return `${OPENWA_BASE_URL}/api${path}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(this.getApiUrl('/health'), { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async sendText(chatId: string, text: string): Promise<OpenWASendTextResponse> {
    try {
      const response = await axios.post(
        this.getApiUrl(`/sessions/${OPENWA_SESSION_NAME}/messages/send-text`),
        { chatId, text },
        { headers: this.getHeaders(), timeout: 30000 },
      );

      return {
        success: true,
        messageId: response.data?.messageId || response.data?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.response?.data?.error || error?.message || 'Failed to send message',
      };
    }
  }

  async sendMedia(
    chatId: string,
    mediaUrl: string,
    caption?: string,
    mediaType?: 'image' | 'video' | 'document' | 'audio',
  ): Promise<OpenWASendMediaResponse> {
    try {
      const body: Record<string, unknown> = { chatId, mediaUrl };
      if (caption) body.caption = caption;
      if (mediaType) body.mediaType = mediaType;

      const response = await axios.post(
        this.getApiUrl(`/sessions/${OPENWA_SESSION_NAME}/messages/send-media`),
        body,
        { headers: this.getHeaders(), timeout: 60000 },
      );

      return {
        success: true,
        messageId: response.data?.messageId || response.data?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.response?.data?.error || error?.message || 'Failed to send media',
      };
    }
  }

  async sendWithFallback(
    chatId: string,
    text: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video' | 'document' | 'audio',
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (mediaUrl) {
      const mediaResult = await this.sendMedia(chatId, mediaUrl, text, mediaType);
      if (mediaResult.success) {
        return { success: true, messageId: mediaResult.messageId };
      }
      return mediaResult;
    }

    return this.sendText(chatId, text);
  }

  async getSessionStatus(): Promise<string> {
    try {
      const response = await axios.get(
        this.getApiUrl(`/sessions/${OPENWA_SESSION_NAME}`),
        { headers: this.getHeaders(), timeout: 5000 },
      );
      return response.data?.status || 'unknown';
    } catch {
      return 'unreachable';
    }
  }

  async startSession(): Promise<{ success: boolean; qrCode?: string }> {
    try {
      const response = await axios.post(
        this.getApiUrl(`/sessions/${OPENWA_SESSION_NAME}/start`),
        {},
        { headers: this.getHeaders(), timeout: 10000 },
      );
      return { success: true, qrCode: response.data?.qrCode };
    } catch (error: any) {
      return { success: false };
    }
  }

  async getQRCode(): Promise<string | null> {
    try {
      const response = await axios.get(
        this.getApiUrl(`/sessions/${OPENWA_SESSION_NAME}/qr`),
        { headers: this.getHeaders(), timeout: 5000 },
      );
      return response.data?.qrCode || null;
    } catch {
      return null;
    }
  }
}

export const openWAService = new OpenWAService();
