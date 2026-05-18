import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl } from "@/lib/site";

const connectorUrl = "https://mcp.propai.live";

const coreTools = [
  "search_listings",
  "search_requirements",
  "match_listing_to_requirement",
  "buyer_to_inventory_match",
  "price_estimate",
  "pricing_negotiation_brief",
  "get_igr_price",
  "market_summary",
  "broker_activity",
  "triage_hot_leads",
  "stale_lead_reactivation",
  "summarise_thread",
  "extract_thread_actions",
  "save_thread_requirement",
  "save_thread_listing",
  "create_thread_follow_up",
  "save_listing",
  "create_requirement",
  "qualify_lead",
  "set_follow_up",
  "draft_broadcast",
  "draft_growth_asset",
];

export const metadata: Metadata = {
  title: "PropAI MCP | Broker Workflow Connector for Claude and MCP Clients",
  description:
    "Connect PropAI broker workflows to Claude and other MCP clients. Search inventory, review pricing context, work CRM actions, triage leads, and manage follow-ups from one authenticated connector.",
  alternates: {
    canonical: canonicalUrl("/mcp"),
  },
  openGraph: {
    title: "PropAI MCP",
    description:
      "Authenticated MCP access to PropAI broker workflows, CRM actions, follow-ups, thread intelligence, and pricing context.",
    url: canonicalUrl("/mcp"),
    type: "website",
  },
};

export default function McpPage() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-5 pt-14 pb-8 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#2DC96E] bg-[rgba(62,232,138,0.12)] px-3.5 py-1.5 text-xs text-white">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#2DC96E]" />
          Authenticated MCP connector
        </div>
        <h1 className="text-[30px] font-medium leading-tight text-white">
          PropAI workflows,<br />
          <em className="not-italic text-[#2DC96E]">inside Claude and MCP clients.</em>
        </h1>
        <p className="mx-auto mt-3.5 max-w-2xl text-sm leading-relaxed text-[#94a3b8]">
          PropAI MCP gives broker teams one authenticated connector for inventory search, pricing context,
          lead triage, thread intelligence, CRM writes, follow-ups, and outbound drafting.
          It is built for operators, not for public browsing.
        </p>
      </section>

      <div className="mx-auto grid max-w-4xl gap-3 px-5 mb-8 sm:grid-cols-3">
        <div className="rounded-xl bg-[#111820] p-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Connector URL</div>
          <div className="mt-2 text-sm font-medium text-white">{connectorUrl}</div>
        </div>
        <div className="rounded-xl bg-[#111820] p-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Authentication</div>
          <div className="mt-2 text-sm font-medium text-white">OAuth and bearer token</div>
        </div>
        <div className="rounded-xl bg-[#111820] p-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Primary use</div>
          <div className="mt-2 text-sm font-medium text-white">Broker ops and GTM workflows</div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">What it covers</div>
        <h2 className="text-xl font-medium text-white">One connector for broker operations</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-[#94a3b8]">
          PropAI MCP exposes the operating layer behind PropAI: inventory lookup, buyer matching,
          pricing and negotiation briefs, hot lead review, stale lead recovery, thread extraction,
          CRM save actions, follow-ups, and growth drafting.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Search and match",
              desc: "Search listings, requirements, and buyer-to-inventory matches with ranked fit and next-step suggestions.",
            },
            {
              title: "Price and negotiate",
              desc: "Use IGR context, comparables, and asking price to build broker-ready pricing and negotiation briefs.",
            },
            {
              title: "Triage and recover",
              desc: "Review hot leads, stale leads, follow-up pressure, and callback queues without digging through CRM screens.",
            },
            {
              title: "Extract and write",
              desc: "Turn stored threads into requirements, listings, follow-up actions, and outbound or GTM drafts.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#243040] bg-[#121a24]/80 p-4">
              <h3 className="text-sm font-medium text-white">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Core tools</div>
        <h2 className="text-xl font-medium text-white">Available MCP actions</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-[#94a3b8]">
          The connector includes read tools, ranking tools, CRM write tools, thread workflows, and GTM drafting.
          It is meant for authenticated workspace use, not anonymous public data access.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {coreTools.map((tool) => (
            <div key={tool} className="rounded-xl border border-[#243040] bg-[#111820] px-3 py-2 text-sm text-[#d5dfeb]">
              {tool}
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">How it works</div>
        <h2 className="text-xl font-medium text-white">Connect in three steps</h2>

        <div className="mt-5 space-y-0">
          {[
            {
              num: "1",
              title: "Add the MCP server",
              desc: `Use ${connectorUrl} as the MCP endpoint in Claude Desktop or another MCP-capable client.`,
            },
            {
              num: "2",
              title: "Authenticate with PropAI",
              desc: "Complete OAuth sign-in or use a valid workspace bearer token so the connector can operate inside your broker context.",
            },
            {
              num: "3",
              title: "Run operational workflows",
              desc: "Search inventory, price a deal, review hot leads, extract thread actions, save CRM records, and schedule follow-ups from the same client session.",
            },
          ].map((step) => (
            <div key={step.num} className="flex gap-4 border-b border-[#243040] py-4 last:border-b-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2DC96E] text-xs font-medium text-white">
                {step.num}
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Example workflows</div>
        <h2 className="text-xl font-medium text-white">What teams actually use it for</h2>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {[
            "Match this buyer brief to current inventory and tell me which two listings I should send first.",
            "Build a negotiation brief for this Powai ask using comparables and IGR context.",
            "Show my hottest leads and tell me what I should handle before EOD.",
            "Extract thread actions from this broker chat, then save the requirement and create the callback.",
            "Find stale leads older than 30 days and draft short reactivation openers.",
            "Draft a broker pitch for PropAI using these proof points and this audience.",
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-[#243040] bg-[#121a24]/80 px-4 py-3 text-sm leading-6 text-[#d5dfeb]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#243040] bg-[#121a24]/80 p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Access model</div>
            <h2 className="mt-2 text-xl font-medium text-white">Private workspace context</h2>
            <p className="mt-2 text-sm leading-7 text-[#94a3b8]">
              PropAI MCP is authenticated. It operates inside the user&apos;s PropAI workspace context and is intended
              for broker operations, not consumer-facing browsing.
            </p>
          </div>

          <div className="rounded-2xl border border-[#243040] bg-[#121a24]/80 p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Get access</div>
            <h2 className="mt-2 text-xl font-medium text-white">Start from PropAI</h2>
            <p className="mt-2 text-sm leading-7 text-[#94a3b8]">
              If you want to use PropAI MCP, start from the PropAI app or the broker signup flow.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="https://app.propai.live"
                className="rounded-xl bg-[#2DC96E] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
              >
                Open PropAI App
              </Link>
              <Link
                href="/broker/signup"
                className="rounded-xl border border-[#243040] bg-[#111820] px-5 py-2.5 text-sm text-[#94a3b8] hover:text-white"
              >
                Broker signup
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
