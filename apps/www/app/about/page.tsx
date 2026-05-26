import type { Metadata } from "next";
import About from "@/pages/About";

export const metadata: Metadata = {
  title: "About PropAI Pulse — Find Off-Market Properties in Mumbai & Indian Cities",
  description:
    "PropAI Pulse gives home buyers and renters early access to off-market properties in Mumbai, Thane, Pune, and across India. Real-time AI-powered listings sourced directly from broker WhatsApp groups. Connect with the listing broker in one click.",
    openGraph: {
      title: "About PropAI Pulse — Off-Market Property Discovery",
      description:
        "Find off-market homes and rentals in Mumbai, Thane, Pune, and across India. Real-time AI listings sourced from broker WhatsApp groups. Direct broker connect, zero stale data.",
      type: "website",
      locale: "en_IN",
    },
  alternates: {
    canonical: "https://www.propai.live/about",
  },
};

export default function Page() {
  return <About />;
}