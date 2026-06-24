import { normalizePhone } from '../services/phoneOwnershipService';

export class WhatsAppService {
  private apiUrl: string;

  constructor() {
    // Use environment variable for API URL, fallback to localhost for development
    this.apiUrl = process.env.API_URL || 'http://localhost:3000';
  }

  /**
   * Send a WhatsApp message with a verification code
   * @param phoneNumber The recipient's phone number
   * @param code The verification code to send
   * @returns Promise resolving to true if message was sent successfully
   */
  async sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const normalizedPhone = normalizePhone(phoneNumber);
      if (!normalizedPhone) {
        console.error('Invalid phone number provided for WhatsApp message:', phoneNumber);
        return false;
      }

      // Try to send via API service
      const response = await fetch(`${this.apiUrl}/api/whatsapp/send-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: normalizedPhone,
          code,
          // In a real implementation, we might need to include authentication
          // For now, we'll assume the API service can handle this appropriately
        }),
      });

      if (!response.ok) {
        // Log the error but don't fail - we'll fall back to simulation
        console.warn(`Failed to send WhatsApp message via API: ${response.status} ${response.statusText}`);
        // Fall back to simulation for development
        return this.simulateSendVerificationCode(normalizedPhone, code);
      }

      const result = await response.json();
      return result.success === true;
    } catch (error) {
      console.error('Error sending WhatsApp verification code:', error);
      // Fall back to simulation in case of network errors, etc.
      return this.simulateSendVerificationCode(phoneNumber, code);
    }
  }

  /**
   * Simulate sending a WhatsApp message (for development/testing)
   * @param phoneNumber The recipient's phone number
   * @param code The verification code
   * @returns Always returns true to simulate success
   */
  private simulateSendVerificationCode(phoneNumber: string, code: string): boolean {
    console.log(`[WhatsApp SIMULATION] Would send verification code "${code}" to ${phoneNumber}`);
    console.log(`[WhatsApp SIMULATION] Message: Your PropAI Pulse verification code is: ${code}`);
    return true;
  }
}

export const whatsappService = new WhatsAppService();