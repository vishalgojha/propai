"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

function istTime(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function istDate(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function ObservationPage() {
  const params = useParams();
  const id = params.id as string;
  const [obs, setObs] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const numId = parseInt(id.replace(/^P/, ""));
    if (!numId) { setError("Invalid ID"); return; }
    api.getObservation(numId)
      .then(setObs)
      .catch(e => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-red-500 text-center py-10 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
          {error}
        </div>
      </div>
    );
  }

  if (!obs) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-[var(--text-muted)] text-center py-10">Loading...</div>
      </div>
    );
  }

  const raw = obs.raw || {};
  const parsed = obs.parsed || {};
  const resolver = obs.resolver || {};
  const cans = (resolver.candidates || []).sort((a: any, b: any) => b.confidence - a.confidence);
  const intentColor = ({ SELL: "badge-green", BUY: "badge-purple", RENT: "badge-yellow", COMMERCIAL: "badge-orange", "PRE-LAUNCH": "badge-red" } as Record<string, string>)[parsed.intent] || "badge-blue";
  const phoneClean = (parsed.broker_phone || "").replace(/[^0-9]/g, "").slice(-10);
  const waLink = phoneClean.length === 10 ? `https://wa.me/91${phoneClean}` : "";
  const confPct = resolver.final_confidence ?? parsed.confidence ?? 0;
  const confColor = confPct > 0.7 ? "text-green-500" : confPct > 0.3 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Observation #{raw.id || `P${parsed.id}`}</h1>

      {/* ── Original Message ── */}
      <Section title="Original WhatsApp Message">
        <KV label="Group" value={raw.group_name} />
        <KV label="Broker" value={parsed.broker_name || raw.sender} />
        {waLink && (
          <div className="flex">
            <span className="text-[var(--text-secondary)] min-w-[130px] text-sm">WhatsApp</span>
            <span className="text-[var(--text-primary)] text-sm">
              +91 {phoneClean.slice(0, 2)}XXXXX{phoneClean.slice(-2)}{" "}
              <a href={waLink} target="_blank" className="text-[var(--blue)] no-underline hover:underline">[Open wa.me]</a>
            </span>
          </div>
        )}
        <KV label="Time" value={istDate(raw.timestamp)} />
        <KV label="Source" value={raw.source} />
        <KV label="Forwarded" value={parsed.forwarded ? "Yes" : "No"} />
        <div className="mt-4 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md p-4 text-sm whitespace-pre-wrap text-[var(--text-primary)] leading-relaxed">
          {raw.message || "—"}
        </div>
      </Section>

      {/* ── Extraction ── */}
      <Section title="Extraction">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <KV label="Intent" value={parsed.intent ? <span className={`badge ${intentColor}`}>{parsed.intent}</span> : "—"} />
          <KV label="Principal" value={parsed.principal || "—"} />
          <KV label="Broker" value={parsed.broker_name || raw.sender || "—"} />
          <KV label="Phone" value={parsed.broker_phone || "—"} />
          <KV label="Building" value={parsed.building_name || "—"} />
          <KV label="BHK" value={parsed.bhk || "—"} />
          <KV label="Price" value={formatBrokerPrice(parsed.price) || "—"} />
          <KV label="Area" value={parsed.area_sqft ? `${parsed.area_sqft.toLocaleString("en-IN")} sqft` : "—"} />
          <KV label="Furnishing" value={parsed.furnishing || "—"} />
          <KV label="Location" value={parsed.location_raw || "—"} />
          <KV label="Micro Market" value={parsed.micro_market ? <>{parsed.micro_market}<span className="prov prov-enriched ml-1">Enriched</span></> : "—"} />
          <KV label="Landmark" value={parsed.landmark_name ? <>{parsed.landmark_name}<span className="prov prov-enriched ml-1">Enriched</span></> : "—"} />
        </div>
        <div className="mt-4 text-right">
          <span className={`text-2xl font-bold ${confColor}`}>{(confPct * 100).toFixed(0)}%</span>
          <span className="text-[var(--text-muted)] text-sm ml-2">confidence</span>
        </div>
      </Section>

      {/* ── Resolution ── */}
      {resolver.id && (
        <Section title="Resolution">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <KV label="Matched Building" value={resolver.building_name || "—"} />
            <KV label="Landmark" value={resolver.landmark_name || "—"} />
            <KV label="Method" value={resolver.method || "—"} />
            <KV label="Detail" value={resolver.method_detail || "—"} />
            {resolver.failure_category && <KV label="Failure" value={<span className="text-red-500">{resolver.failure_category}</span>} />}
          </div>

          {/* Confidence breakdown */}
          <div className="mt-4 flex gap-4">
            {[
              { label: "Parser", value: resolver.parser_confidence },
              { label: "Resolver", value: resolver.resolver_confidence },
              { label: "Final", value: resolver.final_confidence },
            ].map(s => {
              const pct = s.value != null ? (s.value * 100).toFixed(0) : "—";
              const color = s.value != null && s.value > 0.7 ? "green" : s.value != null && s.value > 0.3 ? "yellow" : "red";
              return (
                <div key={s.label} className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md p-3 text-center">
                  <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{s.label}</div>
                  <div className={`text-xl font-bold text-${color}-500`}>{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Candidates */}
          {cans.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-2">Candidates</div>
              <div className="space-y-1">
                {cans.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded px-3 py-1.5">
                    <span className="font-medium text-[var(--text-primary)]">{c.name}</span>
                    <span className="text-[var(--text-muted)]">{(c.confidence * 100).toFixed(0)}%</span>
                    {c.method && <span className="text-[var(--text-secondary)] text-xs">{c.method}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Timeline ── */}
      <Section title="Timeline">
        {[
          { event: "Message received", time: raw.timestamp, icon: "📥" },
          { event: "Parsed", time: parsed.created_at, icon: "🔍" },
          { event: resolver.building_name ? "Building matched" : "Resolution attempted", time: resolver.created_at, icon: "⚖️" },
          { event: "Indexed", time: resolver.created_at, icon: "📌" },
        ].filter(s => s.time).map((s, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5 text-sm">
            <span>{s.icon}</span>
            <span className="text-[var(--text-muted)] min-w-[140px]">{s.event}</span>
            <span className="text-[var(--text-primary)]">{istTime(s.time)}</span>
          </div>
        ))}
        {!raw.timestamp && !parsed.created_at && <div className="text-[var(--text-muted)] text-sm">Timeline unavailable</div>}
      </Section>

      {/* ── AI Actions ── */}
      <Section title="AI (Optional)">
        <div className="flex gap-2 flex-wrap">
          <AIAction href={`/api/ai/explain/${raw.id}`} label="Explain this extraction" />
          <AIAction href={`/api/ai/similar/${raw.id}`} label="Find similar listings" />
          <AIAction href={`/api/ai/broker/${encodeURIComponent(parsed.broker_name || "")}`} label="Broker summary" disabled={!parsed.broker_name} />
        </div>
        <div className="text-[10px] text-[var(--text-muted)] mt-3">
          AI is optional. Everything above this line is deterministic.
        </div>
      </Section>
    </div>
  );
}

/* ── Helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
      <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-4 pb-2 border-b border-[var(--border)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="text-[var(--text-secondary)] min-w-[130px] text-sm">{label}</span>
      <span className="text-[var(--text-primary)] text-sm">{value ?? "—"}</span>
    </div>
  );
}

function AIAction({ href, label, disabled }: { href: string; label: string; disabled?: boolean }) {
  if (disabled) {
    return <span className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-muted)] opacity-50 cursor-default">{label}</span>;
  }
  return (
    <a href={href} target="_blank" className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-xs text-[var(--blue)] no-underline hover:bg-[var(--bg-hover)]">
      {label}
    </a>
  );
}
