import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl } from "@/lib/site";

const connectorUrl = "https://mcp.propai.live";

const coreTools = [
  "search_listings",
  "semantic_search",
  "search_requirements",
  "match_listing_to_requirement",
  "market_summary",
  "price_estimate",
  "get_igr_price",
  "get_fresh_stream",
  "save_listing",
  "create_requirement",
  "qualify_lead",
  "set_follow_up",
  "summarise_thread",
  "draft_broadcast",
  "broker_activity",
  "triage_hot_leads",
  "extract_thread_actions",
  "save_thread_requirement",
  "save_thread_listing",
  "create_thread_follow_up",
  "buyer_to_inventory_match",
  "pricing_negotiation_brief",
  "draft_growth_asset",
];

export const metadata: Metadata = {
  title: "PropAI MCP Server | Real Estate Connector for Claude and MCP Clients",
  description:
    "Connect PropAI's broker-network real estate data to Claude and other MCP clients. Search live listings, inspect IGR pricing, save CRM records, schedule follow-ups, and summarize broker threads.",
  alternates: {
    canonical: canonicalUrl("/mcp"),
  },
  openGraph: {
    title: "PropAI MCP Server",
    description:
      "Broker workflow, listings, CRM, thread summaries, and market intelligence from PropAI.",
    url: canonicalUrl("/mcp"),
    type: "website",
  },
};

export default function McpPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="rounded-[28px] border border-[#243040] bg-[linear-gradient(135deg,rgba(62,232,138,0.12),rgba(9,16,22,0.94)_35%,rgba(9,16,22,0.98))] p-7 sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#3EE88A] bg-[rgba(62,232,138,0.12)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#b9f8d0]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#2DC96E]" />
          Public MCP server
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-tight text-white sm:text-5xl">
          PropAI MCP Server
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#b7c5d6] sm:text-base">
          PropAI brings broker-network real estate intelligence into Claude and other MCP clients.
          You can search fresh listings from WhatsApp broker groups, inspect Maharashtra IGR pricing,
          save CRM records, qualify leads, set follow-ups, draft outreach, and summarize threads from one connector.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#243040] bg-[#101720]/80 p-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Connector URL</div>
            <div className="mt-2 text-sm font-medium text-white">{connectorUrl}</div>
          </div>
          <div className="rounded-2xl border border-[#243040] bg-[#101720]/80 p-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Authentication</div>
            <div className="mt-2 text-sm font-medium text-white">OAuth and bearer token</div>
          </div>
          <div className="rounded-2xl border border-[#243040] bg-[#101720]/80 p-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Primary users</div>
            <div className="mt-2 text-sm font-medium text-white">Real estate brokers and operators</div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {[
          {
            title: "What PropAI MCP does",
            body:
              "It exposes PropAI's real estate workflow to MCP clients: fresh listing search, semantic inventory search, buyer requirement lookup, IGR-backed pricing context, CRM save flows, lead qualification, follow-up scheduling, thread summaries, and broker activity reporting.",
          },
          {
            title: "Where the data comes from",
            body:
              "PropAI ingests broker WhatsApp activity, normalizes it into listing and requirement records, and combines that with market context such as Maharashtra IGR registration data. The MCP server lets authenticated users work with that data inside their client.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-[#243040] bg-[#101720]/80 p-5">
            <h2 className="text-lg font-medium text-white">{item.title}</h2>
            <p className="mt-2 text-sm leading-7 text-[#9fb0c2]">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-[28px] border border-[#243040] bg-[#0f151d]/90 p-7">
        <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Core tools</div>
        <h2 className="mt-2 text-2xl font-medium text-white">Available MCP tools</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#9fb0c2]">
          The server supports read and workflow actions. Search tools operate on PropAI&apos;s broker network data.
          Workflow tools write into the authenticated broker workspace.
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {coreTools.map((tool) => (
            <div
              key={tool}
              className="rounded-xl border border-[#243040] bg-[#121a24] px-3 py-2 text-sm text-[#d8e4f0]"
            >
              {tool}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[#243040] bg-[#101720]/80 p-7">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Setup</div>
          <h2 className="mt-2 text-2xl font-medium text-white">Connect in an MCP client</h2>
          <ol className="mt-5 space-y-4 text-sm leading-7 text-[#9fb0c2]">
            <li>
              1. Add the server URL: <span className="font-medium text-white">{connectorUrl}</span>
            </li>
            <li>
              2. Complete OAuth sign-in with your PropAI account, or use a valid bearer token tied to your workspace.
            </li>
            <li>
              3. Start with listing search, IGR pricing, or CRM save actions depending on your workflow.
            </li>
          </ol>

          <div className="mt-6 rounded-2xl border border-[#243040] bg-[#0c1118] p-4">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Common prompts</div>
            <div className="mt-3 space-y-2 text-sm text-[#d8e4f0]">
              <div>&ldquo;Find fresh 2BHK sale listings in Bandra under 4 Cr.&rdquo;</div>
              <div>&ldquo;What is the last registered IGR rate for this building in Powai?&rdquo;</div>
              <div>&ldquo;Save this requirement and set a follow-up for tomorrow morning.&rdquo;</div>
              <div>&ldquo;Summarise this broker thread and tell me the next action.&rdquo;</div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#243040] bg-[#101720]/80 p-7">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Best for</div>
          <h2 className="mt-2 text-2xl font-medium text-white">Primary use cases</h2>
          <div className="mt-5 space-y-4">
            {[
              "Search live broker inventory faster than traditional property portals.",
              "Compare ask prices against recent Maharashtra IGR transaction context.",
              "Save listings and buyer requirements into the broker CRM from a client chat.",
              "Qualify inbound leads and keep callback queues structured.",
              "Turn noisy WhatsApp threads into concise operational summaries.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-[#243040] bg-[#0c1118] px-4 py-3 text-sm leading-6 text-[#d8e4f0]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-[28px] border border-[#243040] bg-[#101720]/80 p-7">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Security and privacy</div>
          <h2 className="mt-2 text-2xl font-medium text-white">Access model</h2>
          <p className="mt-3 text-sm leading-7 text-[#9fb0c2]">
            The MCP server is authenticated. Users only access their own PropAI workspace context.
            The public website and policies for PropAI are available at{" "}
            <Link href="/" className="text-[#3EE88A] hover:underline">
              propai.live
            </Link>.
          </p>
        </div>

        <div className="rounded-[28px] border border-[#243040] bg-[#101720]/80 p-7">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8399]">Need access?</div>
          <h2 className="mt-2 text-2xl font-medium text-white">Get started with PropAI</h2>
          <p className="mt-3 text-sm leading-7 text-[#9fb0c2]">
            If you want to use PropAI MCP with a broker workspace, start from the PropAI app or broker signup flow.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="https://app.propai.live"
              className="rounded-xl bg-[#2DC96E] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              Open PropAI App
            </a>
            <Link
              href="/broker/signup"
              className="rounded-xl border border-[#243040] bg-[#121a24] px-5 py-2.5 text-sm text-[#d5dfeb] hover:text-white"
            >
              Broker signup
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
