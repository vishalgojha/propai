import React from 'react';
import { LegalPage } from '../components/LegalPage';

export const Terms: React.FC = () => {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="These terms cover use of PropAI Pulse, including account access, session restore on this browser, subscriptions, and acceptable use of the broker workspace."
      updatedAt="April 24, 2026"
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
