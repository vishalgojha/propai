import type { Metadata } from "next";
import MCP from "@/views/MCP";
import { MCP_CAPABILITIES } from "@/lib/mcp";

export const metadata: Metadata = {
  title: "PropAI MCP | Private authenticated market intelligence interface",
  description:
    "PropAI MCP is a secure authenticated interface for AI agents and brokers to query live B2B broker WhatsApp network streams.",
  alternates: {
    canonical: "https://www.propai.live/mcp",
  },
  openGraph: {
    title: "PropAI MCP | Private authenticated market intelligence interface",
    description:
      "Secure MCP access for AI agents and brokers. Public docs explain the concept; the production server stays private and Supabase-authenticated.",
    type: "website",
    locale: "en_IN",
    url: "https://www.propai.live/mcp",
    siteName: "PropAI Pulse",
  },
  twitter: {
    card: "summary_large_image",
    title: "PropAI MCP | Private authenticated market intelligence interface",
    description:
      "Secure MCP access for AI agents and brokers. Public docs explain the concept; the production server stays private and Supabase-authenticated.",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PropAI MCP",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Private authenticated MCP interface for PropAI Pulse B2B broker network intelligence.",
    url: "https://www.propai.live/mcp",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    featureList: [...MCP_CAPABILITIES],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MCP />
    </>
  );
}
