import React from 'react';
import { ArrowRightIcon } from '../lib/icons';
import { PROPAI_ASSISTANT_PHONE_DIGITS } from '../lib/propai';

const onboardingWhatsAppLink = `https://wa.me/91${PROPAI_ASSISTANT_PHONE_DIGITS}?text=${encodeURIComponent('ONBOARD ME')}`;

export const Onboarding: React.FC = () => (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center">
        <section className="w-full max-w-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">PropAI Pulse</p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Set up on WhatsApp</h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-gray-400">
                Pulse sets up your broker workspace in WhatsApp. It will collect your details there and keep the dashboard access flow tied to your account.
            </p>
            <a
                href={onboardingWhatsAppLink}
                className="mt-9 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-base font-semibold text-black transition hover:opacity-90"
            >
                Start WhatsApp onboarding and send “ONBOARD ME” <ArrowRightIcon className="h-5 w-5" />
            </a>
            <p className="mt-5 text-sm text-gray-500">No web form. Listings, requirements, and support stay in WhatsApp.</p>
        </section>
    </main>
);
