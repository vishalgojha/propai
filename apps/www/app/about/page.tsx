import type { Metadata } from "next";
import About from "@/pages/About";

export const metadata: Metadata = {
  title: "About PropAI Pulse — Off-Market Property Intelligence for Indian Brokers",
  description:
    "PropAI Pulse is a real-time AI platform that parses WhatsApp broker groups across Mumbai, Pune, and Indian cities. Extract structured off-market listings, rental inventory, and buyer requirements before they hit MagicBricks or 99acres. Built by Chaos Craft Labs.",
  openGraph: {
    title: "About PropAI Pulse — Off-Market Property Intelligence",
    description:
      "AI-powered real estate intelligence platform for Indian brokers. Parses WhatsApp groups in real-time, extracts structured listings, and surfaces off-market inventory seconds after a broker posts.",
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