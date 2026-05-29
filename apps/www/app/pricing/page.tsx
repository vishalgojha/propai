import type { Metadata } from "next";
import Pricing from "@/pages/Pricing";

export const metadata: Metadata = {
  title: "PropAI Pricing — ₹1,999 first month, then ₹1,499/mo",
  description:
    "Broker pricing for PropAI Pulse: first month ₹1,999 including ₹500 worth of API keys, then ₹1,499/mo.",
  alternates: {
    canonical: "https://www.propai.live/pricing",
  },
  openGraph: {
    title: "PropAI Pricing",
    description:
      "WhatsApp-native broker CRM pricing: first month ₹1,999 including ₹500 worth of API keys, then ₹1,499/mo.",
    type: "website",
    locale: "en_IN",
  },
};

export default function Page() {
  return <Pricing />;
}
