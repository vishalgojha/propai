import type { Metadata } from "next";
import About from "@/pages/About";

export const metadata: Metadata = {
  title: "About PropAI — Fresh Mumbai Property Listings from Broker WhatsApp Groups",
  description:
    "Fresh Mumbai property listings straight from broker WhatsApp groups. No fake listings, no portal reposts, no bait-and-switch pricing. Real inventory, real time.",
    openGraph: {
      title: "About PropAI — Fresh Mumbai Property Listings from Broker WhatsApp",
      description:
        "Fresh Mumbai property listings straight from broker WhatsApp groups. No fake listings, no portal reposts, no bait-and-switch pricing. Real inventory, real time.",
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
