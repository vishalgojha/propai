import React from 'react';
import { LegalPage } from '../components/LegalPage';

export const ContactUs: React.FC = () => {
  return (
    <LegalPage
      title="Contact Us"
      intro="Reach the PropAI Pulse team for support, billing, or subscription questions."
      updatedAt="April 24, 2026"
      sections={[
        {
          title: 'Support email',
          body: [
            'Email support@propai.live for login help, billing questions, policy requests, or product support.',
          ],
        },
        {
          title: 'Business hours',
          body: [
            'We respond during normal business hours and aim to reply as quickly as possible.',
          ],
        },
      ]}
    />
  );
};
