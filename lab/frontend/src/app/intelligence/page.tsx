"use client";

import { useState } from "react";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

export default function IntelligencePage() {
  const [obsId, setObsId] = useState("");
  const [obs, setObs] = useState<any>(null);
  const [error, setError] = useState("");

  async function inspect() {
    const id = parseInt(obsId);
    if (!id) return;
    setError("");
    setObs(null);
    try {
      const data = await api.getObservation(id);
      setObs(data);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Intelligence</h2>

      <div className="flex gap-2 items-center">
        <input
          type="number"
          placeholder="Observation ID..."
          value={obsId}
          onChange={e => setObsId(e.target.value)}
          onKeyDown={e => e.key === "Enter" && inspect()}
          className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-primary)] w-40"
        />
        <button onClick={inspect} className="px-3 py-1.5 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Inspect</button>
      </div>

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {obs && <EvidenceInspector obs={obs} />}

      {!obs && !error && (
        <div className="text-[var(--text-muted)] text-center py-10">Enter an observation ID to inspect evidence.</div>
      )}
    </div>
  );
}

function EvidenceInspector({ obs }: { obs: any }) {
  const raw = obs.raw || {};
  const parsed = obs.parsed || {};
  const resolver = obs.resolver || {};

  return (
    <div className="inspector space-y-4">
      <h3 className="text-base font-bold text-[var(--text-primary)]">Evidence Inspector</h3>

      <div className="grid grid-cols-3 gap-2 text-sm">
        {[
          ["Observation #", raw.id],
          ["Group", raw.group_name],
          ["Sender", raw.sender],
          ["Timestamp", raw.timestamp],
          ["Source", raw.source],
          ["Pipeline", raw.pipeline_version],
        ].map(([k, v]) => (
          <div key={k as string} className="flex">
            <span className="text-[var(--text-secondary)] min-w-[100px]">{k as string}</span>
            <span className="text-[var(--text-primary)]">{v || "—"}</span>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Raw Message</h4>
        <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md p-3 text-sm whitespace-pre-wrap">{raw.message || ""}</div>
      </div>

      {parsed.id && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Extraction</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Intent", parsed.intent],
              ["Principal", parsed.principal],
              ["BHK", parsed.bhk],
              ["Price", formatBrokerPrice(parsed.price)],
              ["Area", parsed.area_sqft ? `${parsed.area_sqft} sqft` : ""],
              ["Furnishing", parsed.furnishing],
              ["Location", parsed.location_raw],
              ["Landmark", parsed.landmark_name],
              ["Building", parsed.building_name],
              ["Market", parsed.micro_market],
              ["Confidence", parsed.confidence ? `${(parsed.confidence * 100).toFixed(0)}%` : ""],
            ].map(([k, v]) => v ? (
              <div key={k as string} className="flex">
                <span className="text-[var(--text-secondary)] min-w-[100px]">{k as string}</span>
                <span className="text-[var(--text-primary)]">{v}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {resolver.id && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Resolution</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Building", resolver.building_name],
              ["Landmark", resolver.landmark_name],
              ["Method", resolver.method],
              ["Parser", resolver.parser_confidence ? `${(resolver.parser_confidence * 100).toFixed(0)}%` : ""],
              ["Resolver", resolver.resolver_confidence ? `${(resolver.resolver_confidence * 100).toFixed(0)}%` : ""],
              ["Final", resolver.final_confidence ? `${(resolver.final_confidence * 100).toFixed(0)}%` : ""],
              ["Failure", resolver.failure_category],
            ].map(([k, v]) => v ? (
              <div key={k as string} className="flex">
                <span className="text-[var(--text-secondary)] min-w-[100px]">{k as string}</span>
                <span className="text-[var(--text-primary)]">{v}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}
    </div>
  );
}
