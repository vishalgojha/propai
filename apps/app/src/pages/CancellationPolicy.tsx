import React from 'react';
import { LegalPage } from '../components/LegalPage';

export const CancellationPolicy: React.FC = () => {
  return (
    <LegalPage
      title="Cancellation Policy"
      intro="This policy explains how you can stop recurring billing or discontinue a PropAI Pulse subscription."
      updatedAt="April 24, 2026"
      sections={[
        {
          title: 'How cancellation works',
          body: [
            'You may cancel your subscription at any time from the account or billing flow, or by contacting support@propai.live if self-service is unavailable.',
            'Cancellation stops future renewals. Access remains available until the end of the current paid period unless we tell you otherwise.',
          ],
        },
        {
          title: 'Service interruption',
          body: [
            'If a payment fails or a subscription expires, access to paid features may be paused until billing is resolved.',
            'We may also pause access if required for security, abuse prevention, or legal compliance.',
          ],
        },
        {
          title: 'Questions',
          body: [
            'For billing changes, cancellations, or subscription support, contact support@propai.live.',
          ],
        },
      ]}
    />
  );
};
