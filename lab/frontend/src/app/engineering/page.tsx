"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";

type EngineeringContext = { git?: { branch?: string; status?: string }; api_routes?: unknown[]; services?: unknown[] };
type ChatAnswer = { answer: string; references?: api.EngineeringSearchResult[] };
type TaskPlan = { estimated_files: string | number; approval_required: boolean; steps: { label: string }[] };
type EngineeringIndex = { files?: unknown[]; functions?: unknown[]; routes?: unknown[]; components?: unknown[]; database?: unknown[] };
type KnowledgeDoc = { title: string; items: string[] };
type LogResponse = { available?: boolean; lines?: string[] };
type TerminalState = { reason?: string };
type McpItem = { name: string; configured: boolean; env?: string | null; mode: string };

const tabs = ["Chat", "Tasks", "Repository", "Knowledge", "Logs", "Terminal", "MCP"];

export default function EngineeringPage() {
  const [active, setActive] = useState("Chat");
  const [context, setContext] = useState<EngineeringContext | null>(null);

  useEffect(() => {
    api.getEngineeringContext().then(setContext).catch(() => setContext(null));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Engineering</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Repository-aware development console. AI is optional; deterministic tools stay available.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge label="No auto-exec" />
          <Badge label="Diff before apply" />
          <Badge label={context?.git?.branch ? `Branch ${context.git.branch}` : "Context loading"} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-[var(--border)] pb-2">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActive(tab)} className={`px-3 py-1.5 rounded-lg text-sm border ${active === tab ? "bg-[var(--accent)] text-[var(--on-propai-green)] border-[var(--accent)] font-bold" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-strong)]"}`}>
            {tab}
          </button>
        ))}
      </div>

      {active === "Chat" && <ChatPanel context={context} />}
      {active === "Tasks" && <TasksPanel />}
      {active === "Repository" && <RepositoryPanel />}
      {active === "Knowledge" && <KnowledgePanel />}
      {active === "Logs" && <LogsPanel />}
      {active === "Terminal" && <TerminalPanel />}
      {active === "MCP" && <MCPPanel />}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="badge badge-blue">{label}</span>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">{children}</div>;
}

function ChatPanel({ context }: { context: EngineeringContext | null }) {
  const [message, setMessage] = useState("Explain the resolver pipeline");
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!message.trim()) return;
    setLoading(true);
    try {
      setAnswer(await api.engineeringChat(message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-xl:grid-cols-1">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} className="flex-1 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-strong)] rounded-lg text-sm" placeholder="Ask about parser, resolver, API routes, React pages..." />
            <button onClick={ask} disabled={loading} className="px-4 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold disabled:opacity-50">Ask</button>
          </div>
          {answer ? (
            <div className="space-y-3">
              <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-4 text-sm leading-6">{answer.answer}</div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Repository References</div>
                <ResultList results={answer.references || []} />
              </div>
            </div>
          ) : <div className="text-sm text-[var(--text-muted)] py-8 text-center">Ask a codebase question. Context is collected before every response.</div>}
        </div>
        <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-3 text-xs space-y-2">
          <div className="font-semibold text-sm">Context Included</div>
          <KV k="Branch" v={context?.git?.branch || "—"} />
          <KV k="Status" v={context?.git?.status ? "Dirty" : "Clean/unknown"} />
          <KV k="Routes" v={String(context?.api_routes?.length || 0)} />
          <KV k="Services" v={String(context?.services?.length || 0)} />
          <div className="text-[var(--text-muted)] pt-2">AI provider calls are disabled in this build unless explicitly configured later. Answers fall back to deterministic repository intelligence.</div>
        </div>
      </div>
    </Panel>
  );
}

function TasksPanel() {
  const [prompt, setPrompt] = useState("Build broker analytics");
  const [plan, setPlan] = useState<TaskPlan | null>(null);

  async function createPlan() {
    if (!prompt.trim()) return;
    setPlan(await api.createEngineeringTask(prompt));
  }

  return (
    <Panel>
      <div className="flex gap-2 mb-4">
        <input value={prompt} onChange={e => setPrompt(e.target.value)} className="flex-1 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-strong)] rounded-lg text-sm" />
        <button onClick={createPlan} className="px-4 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Plan</button>
      </div>
      {plan ? (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-xl:grid-cols-1">
          <div>
            <div className="text-sm font-semibold mb-2">Plan</div>
            <div className="space-y-2">{plan.steps.map((s, i: number) => <div key={i} className="flex items-center gap-2 text-sm"><span className="badge badge-gray">{i + 1}</span>{s.label}</div>)}</div>
          </div>
          <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-3 text-sm space-y-2">
            <KV k="Estimated files" v={String(plan.estimated_files)} />
            <KV k="Approval" v={plan.approval_required ? "Required" : "Not required"} />
            <div className="text-xs text-[var(--text-muted)]">Patch generation is review-only. Approve/Reject/Edit/Regenerate controls become active when a patch exists.</div>
            <DiffReview />
          </div>
        </div>
      ) : <div className="text-sm text-[var(--text-muted)] text-center py-8">Describe work to generate a reviewed task plan.</div>}
    </Panel>
  );
}

function DiffReview() {
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border)] text-xs font-semibold">Diff View</div>
      <div className="p-3 space-y-2 text-xs">
        <KV k="Files modified" v="0" />
        <KV k="Added" v="0" />
        <KV k="Removed" v="0" />
        <KV k="Summary" v="No generated patch yet" />
        <pre className="bg-[var(--bg-base)] border border-dashed border-[var(--border-strong)] rounded p-2 text-[var(--text-muted)] whitespace-pre-wrap">Unified diff will appear here before anything can be applied.</pre>
        <div className="flex gap-2 flex-wrap pt-1">
          {["Approve", "Reject", "Edit prompt", "Regenerate"].map(label => (
            <button key={label} disabled className="px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-muted)] disabled:opacity-50">{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RepositoryPanel() {
  const [query, setQuery] = useState("parser");
  const [results, setResults] = useState<api.EngineeringSearchResult[]>([]);
  const [index, setIndex] = useState<EngineeringIndex | null>(null);

  useEffect(() => { api.getEngineeringIndex().then(setIndex).catch(() => {}); }, []);

  async function search() {
    setResults(await api.searchEngineering(query));
  }

  return (
    <Panel>
      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <div className="space-y-2 text-sm">
          <Metric label="Files" value={index?.files?.length} />
          <Metric label="Functions" value={index?.functions?.length} />
          <Metric label="Routes" value={index?.routes?.length} />
          <Metric label="Components" value={index?.components?.length} />
          <Metric label="Database docs" value={index?.database?.length} />
        </div>
        <div>
          <div className="flex gap-2 mb-3">
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} className="flex-1 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-strong)] rounded-lg text-sm" placeholder="Find parser, Evolution, Building model..." />
            <button onClick={search} className="px-4 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Search</button>
          </div>
          <ResultList results={results} />
        </div>
      </div>
    </Panel>
  );
}

function KnowledgePanel() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  useEffect(() => { api.getEngineeringKnowledge().then(setDocs).catch(() => setDocs([])); }, []);
  return <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">{docs.map(doc => <Panel key={doc.title}><div className="font-semibold mb-2">{doc.title}</div><ul className="space-y-1 text-sm text-[var(--text-secondary)]">{(doc.items || []).map((item: string, i: number) => <li key={i}>{item}</li>)}</ul></Panel>)}</div>;
}

function LogsPanel() {
  const [kind, setKind] = useState("server");
  const [logs, setLogs] = useState<LogResponse | null>(null);
  useEffect(() => { api.getEngineeringLogs(kind).then(setLogs).catch(() => setLogs(null)); }, [kind]);
  return <Panel><div className="flex gap-2 mb-3 flex-wrap">{["server", "webhook", "evolution", "parser", "resolver", "database"].map(k => <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-lg text-sm border ${kind === k ? "bg-[var(--accent)] text-[var(--on-propai-green)] border-[var(--accent)]" : "bg-[var(--bg-elevated)] border-[var(--border-strong)]"}`}>{k}</button>)}</div><pre className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-3 text-xs overflow-auto max-h-[560px] whitespace-pre-wrap">{logs?.available ? logs.lines.join("\n") : `No ${kind} log available.`}</pre></Panel>;
}

function TerminalPanel() {
  const [state, setState] = useState<TerminalState | null>(null);
  useEffect(() => { api.getEngineeringTerminal().then(setState).catch(() => {}); }, []);
  return <Panel><div className="text-lg font-semibold mb-2">Terminal disabled</div><p className="text-sm text-[var(--text-muted)]">{state?.reason || "Terminal execution is disabled by policy."}</p></Panel>;
}

function MCPPanel() {
  const [items, setItems] = useState<McpItem[]>([]);
  useEffect(() => { api.getEngineeringMCP().then(setItems).catch(() => setItems([])); }, []);
  return <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">{items.map(item => <Panel key={item.name}><div className="font-semibold">{item.name}</div><div className={`badge mt-2 ${item.configured ? "badge-green" : "badge-gray"}`}>{item.configured ? "Configured" : "Not configured"}</div><div className="text-xs text-[var(--text-muted)] mt-2">{item.env || "built-in"}</div><div className="text-xs text-[var(--text-muted)]">{item.mode}</div></Panel>)}</div>;
}

function ResultList({ results }: { results: api.EngineeringSearchResult[] }) {
  if (!results?.length) return <div className="text-sm text-[var(--text-muted)] py-4">No repository results.</div>;
  return <div className="space-y-2">{results.map(r => <div key={r.path} className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-3"><div className="text-sm font-semibold text-[var(--blue)]">{r.path}</div>{r.matches?.map(m => <div key={`${r.path}:${m.line}`} className="text-xs text-[var(--text-muted)] mt-1"><span className="text-[var(--text-secondary)]">{m.line}</span> {m.text}</div>)}</div>)}</div>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-3"><div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</div><div className="text-2xl font-bold">{value ?? "—"}</div></div>;
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2 justify-between"><span className="text-[var(--text-muted)]">{k}</span><span className="text-right">{v || "—"}</span></div>;
}
