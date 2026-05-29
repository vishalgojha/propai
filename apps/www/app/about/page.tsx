import type { Metadata } from "next";
import About from "@/pages/About";

export const metadata: Metadata = {
  title: "About PropAI Pulse — WhatsApp-native real estate intelligence for brokers",
  description:
    "PropAI Pulse turns broker WhatsApp dumps into structured listings, requirements, and locality intelligence for Mumbai brokers. Built for live inventory, not stale portal reposts.",
    openGraph: {
      title: "About PropAI Pulse — WhatsApp-native real estate intelligence",
      description:
        "Turn broker WhatsApp dumps into structured listings, requirements, and locality intelligence. PropAI Pulse is built for live inventory, not stale portal reposts.",
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
