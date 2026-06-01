import type { Metadata } from "next";
import MCPSecurity from "@/views/MCPSecurity";

const canonical = "https://www.propai.live/mcp/security";

export const metadata: Metadata = {
  title: "PropAI MCP Security | Private authenticated access and data policy",
  description:
    "Security overview for PropAI MCP. Production access requires Supabase authentication, role checks, audit logging, and rate limits.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "PropAI MCP Security | Private authenticated access and data policy",
    description:
      "Read how PropAI MCP protects private broker data with Supabase auth, RBAC, audit logging, and rate limits.",
    type: "article",
    locale: "en_IN",
    url: canonical,
    siteName: "PropAI Pulse",
  },
  twitter: {
    card: "summary_large_image",
    title: "PropAI MCP Security | Private authenticated access and data policy",
    description:
      "Read how PropAI MCP protects private broker data with Supabase auth, RBAC, audit logging, and rate limits.",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "PropAI MCP security",
    description:
      "Security overview for PropAI MCP. Production access requires Supabase authentication, role checks, audit logging, and rate limits.",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
    author: {
      "@type": "Organization",
      name: "PropAI Pulse",
    },
    publisher: {
      "@type": "Organization",
      name: "PropAI Pulse",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MCPSecurity />
    </>
  );
}
