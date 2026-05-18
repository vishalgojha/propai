import React from 'react';
import { LegalPage } from '../components/LegalPage';

export const RefundPolicy: React.FC = () => {
  return (
    <LegalPage
      title="Refund Policy"
      intro="This policy describes when subscription refunds may be available for PropAI Pulse purchases and recurring billing."
      updatedAt="April 24, 2026"
      sections={[
        {
          title: 'Refund eligibility',
          body: [
            'Refunds are reviewed case by case for accidental duplicate billing, unauthorized charges, or verified service issues within a reasonable review period.',
            'If your plan is canceled before the next renewal, access typically continues until the end of the paid billing cycle and no prorated refund is promised unless required by law.',
          ],
        },
        {
          title: 'How to request a refund',
          body: [
            'Email support@propai.live with the billing email, payment date, and a short explanation of the issue.',
            'We may ask for supporting details before making a decision.',
          ],
        },
        {
          title: 'Processing',
          body: [
            'Approved refunds are sent back through the original payment method where possible.',
            'Processing time depends on the payment provider and bank timelines.',
          ],
        },
      ]}
    />
  );
};
