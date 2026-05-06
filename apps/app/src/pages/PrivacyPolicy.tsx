import React from 'react';
import { LegalPage } from '../components/LegalPage';

export const PrivacyPolicy: React.FC = () => {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains how PropAI Pulse handles account details, browser session restore, and the information you enter while using the app."
      updatedAt="April 24, 2026"
      sections={[
        {
          title: 'Information we collect',
          body: [
            'We collect the email address used to sign in, the session data needed to restore your workspace on this device, and the content you submit while using the broker workspace.',
            'If you use billing or subscription features, payment status may be processed by our payment provider, but card details are handled by the provider and are not stored in our app.',
          ],
        },
        {
          title: 'How we use information',
          body: [
            'We use your information to authenticate you, restore your session, operate the broker workflows, and improve the app experience.',
            'We may also use the data to troubleshoot issues, secure the platform, and support subscription management.',
          ],
        },
        {
          title: 'Storage and sharing',
          body: [
            'Login session data may be stored in your browser to support the Remember this device option and keep you signed in on this browser.',
            'We do not sell your personal data. We may share limited operational data with service providers required to run the product, such as authentication, hosting, and payment services.',
          ],
        },
      ]}
    />
  );
};
