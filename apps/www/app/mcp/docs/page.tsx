import type { Metadata } from "next";
import MCPDocs from "@/views/MCPDocs";
import { MCP_PUBLIC_DOCS_URL } from "@/lib/mcp";

export const metadata: Metadata = {
  title: "PropAI MCP Docs | Public documentation for authenticated market intelligence",
  description:
    "Public documentation for PropAI MCP. Learn what the private authenticated interface enables at a high level, with demo-only examples.",
  alternates: {
    canonical: MCP_PUBLIC_DOCS_URL,
  },
  openGraph: {
    title: "PropAI MCP Docs | Public documentation for authenticated market intelligence",
    description:
      "Learn what PropAI MCP enables at a high level. Public-safe docs for AI agents, crawlers, and developer tools.",
    type: "article",
    locale: "en_IN",
    url: MCP_PUBLIC_DOCS_URL,
    siteName: "PropAI Pulse",
  },
  twitter: {
    card: "summary_large_image",
    title: "PropAI MCP Docs | Public documentation for authenticated market intelligence",
    description:
      "Learn what PropAI MCP enables at a high level. Public-safe docs for AI agents, crawlers, and developer tools.",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "PropAI MCP docs",
    description:
      "Public documentation for PropAI MCP. Learn what the private authenticated interface enables at a high level, with demo-only examples.",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": MCP_PUBLIC_DOCS_URL,
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
      <MCPDocs />
    </>
  );
}
