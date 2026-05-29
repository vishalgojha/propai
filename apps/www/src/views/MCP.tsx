import { Code2, Cpu, Wrench, Shield, ArrowRight } from 'lucide-react';

export default function MCP() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 space-y-16">
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-glow)] px-4 py-1.5 mb-2 hover:scale-105 transition-transform cursor-pointer">
           <Code2 className="h-4 w-4 text-[var(--accent)]" />
           <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]">Protocol Specification v1.0</span>
        </div>
        <h1 className="text-[48px] md:text-[56px] font-bold text-[var(--text-primary)] leading-tight tracking-tight">
          Model Context Protocol
        </h1>
        <p className="text-[18px] leading-relaxed text-[var(--text-secondary)] max-w-2xl mx-auto">
          Universal interface for AI agents to query real-time property intelligence from the PropAI network.
        </p>
      </div>

      <div className="rounded-[24px] border border-[color:var(--border-strong)] bg-[var(--bg-surface)] p-8 space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]">PropAI overview</p>
        <h2 className="text-[28px] font-bold text-[var(--text-primary)]">WhatsApp-native CRM and market intelligence for Mumbai brokers</h2>
        <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
          PropAI turns broker WhatsApp dumps into structured listings, requirements, and locality intelligence.
          It normalizes locality aliases, keeps the public site on live inventory, and gives brokers direct access
          to actionable market data instead of stale portal reposts.
        </p>
        <div className="grid gap-3 sm:grid-cols-1">
          <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">For agents</div>
            <div className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              Use this page as the canonical model summary for AI agents, browser tooling, and MCP integrations.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { t: 'Live Listings Tool', d: 'Query active verified listings from live broker inventory, not stale portal reposts.', i: Cpu },
          { t: 'Area Insights Tool', d: 'Retrieve real-time supply and demand metrics for specific localities and belts.', i: TrendingUp },
          { t: 'Broker Connect Tool', d: 'Securely facilitate direct broker connections between agents.', i: MessageSquareIcon },
          { t: 'Authentication', d: 'Protocol-level security for broker workspace data and market intelligence.', i: Shield }
        ].map((item, i) => (
           <div key={i} className="group p-8 rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)] transition-all">
              <div className="h-12 w-12 rounded-[12px] bg-[var(--bg-elevated)] border border-[color:var(--border)] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <item.i className="h-6 w-6 text-[var(--accent)]" />
              </div>
              <h3 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">{item.t}</h3>
              <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">{item.d}</p>
           </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] p-10 space-y-8">
         <h3 className="text-[20px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[var(--accent)]" />
            Standard Integration Example
         </h3>

         <div className="rounded-[16px] bg-[#090d12] p-6 font-mono text-[13px] border border-[color:var(--border)] overflow-x-auto">
            <div className="space-y-1">
               <div className="text-pink-400">const<span className="text-white"> mcp = </span>new<span className="text-yellow-400"> PropAIMCP</span><span className="text-white">({'{'}</span></div>
               <div className="pl-4 text-white">apiKey: <span className="text-green-400">'YOUR_MODEL_KEY'</span>,</div>
               <div className="pl-4 text-white">protocol: <span className="text-green-400">'v1'</span></div>
               <div className="text-white">{'}'});</div>
               <div className="h-4" />
               <div className="text-slate-500">{'// Query live listings for Cursor/Claude/Gemini'}</div>
               <div className="text-pink-400">await<span className="text-white"> mcp.</span><span className="text-blue-400">getListings</span><span className="text-white">({'{'}</span></div>
               <div className="pl-4 text-white">locality: <span className="text-green-400">'Bandra West'</span>,</div>
               <div className="pl-4 text-white">budget: <span className="text-purple-400">125000</span></div>
               <div className="text-white">{'}'});</div>
            </div>
         </div>

         <div className="flex justify-between items-center bg-[var(--accent-glow)] border border-[color:var(--accent-border)] p-4 rounded-[14px]">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">Documentation Status: GA-Public</span>
            <button className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)] hover:text-[var(--accent)]">
               Explore Full Spec <ArrowRight className="h-4 w-4" />
            </button>
         </div>
      </div>
    </div>
  );
}

function TrendingUp(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

function MessageSquareIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
