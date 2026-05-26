import React from 'react';
import { LegalPage } from '../components/LegalPage';

export const Terms: React.FC = () => {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="These terms cover use of PropAI Pulse, including account access, session restore on this browser, subscriptions, broker contact visibility, and acceptable use of the workspace."
      updatedAt="May 26, 2026"
      sections={[
        {
          title: 'Use of the service',
          body: [
            'You may use PropAI Pulse for lawful business purposes only.',
            'You are responsible for the accuracy of the information you submit and for keeping your account and session secure.',
          ],
        },
        {
          title: 'Subscriptions and access',
          body: [
            'Some features may require an active subscription managed through our payment provider.',
            'We may keep your browser session active on this device when you choose the Remember this device option.',
            'We may change feature availability, pricing, or access rules with reasonable notice where required.',
          ],
        },
        {
          title: 'Broker contact data',
          body: [
            'Broker names, phone numbers, WhatsApp group references, and related market signals may be displayed to help brokers discover and connect over active inventory.',
            'Use this information responsibly and only for legitimate brokerage and property-related outreach.',
            'If you believe a contact or group should be reviewed for removal, email support@propai.live with the relevant details and we will review the request in good faith.',
          ],
        },
        {
          title: 'Acceptable use',
          body: [
            'Do not attempt to misuse the service, interfere with security, or use the product in a way that violates applicable law.',
            'We may suspend access if we reasonably believe the service is being abused or the account is compromised.',
          ],
        },
      ]}
    />
  );
};
