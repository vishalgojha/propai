import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Set up on WhatsApp | PropAI Pulse',
  description: 'Set up your broker workspace on WhatsApp. No web forms - everything stays in WhatsApp.',
};

export default function OnboardingPage() {
  const onboardingWhatsAppLink = `https://wa.me/917030437078?text=${encodeURIComponent('ONBOARD ME')}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center">
      <section className="w-full max-w-xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">PropAI Pulse</p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Set up on WhatsApp</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-gray-400">
          Pulse sets up your broker workspace in WhatsApp. It will collect your details there and keep the dashboard access flow tied to your account.
        </p>
        <a
          href="https://wa.me/917021045254?text=ONBOARD%20ME"
          className="mt-9 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-base font-semibold text-black transition hover:opacity-90"
        >
          Start WhatsApp onboarding and send &ldquo;ONBOARD ME&rdquo; <ArrowRight className="h-5 w-5" />
        </a>
        <p className="mt-5 text-sm text-gray-500">No web form. Listings, requirements, and support stay in WhatsApp.</p>
        <p className="mt-8 text-sm text-gray-600">
          Already have an account? <Link href="/login" className="text-[var(--accent)] underline">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
