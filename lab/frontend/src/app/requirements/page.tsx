"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";

const PAGE_SIZE = 50;
const REQUIREMENT_TYPES = ["REQUIREMENT", "RENTAL_SEEKER"];

const typeColors: Record<string, string> = {
  REQUIREMENT: "badge-purple",
  RENTAL_SEEKER: "badge-yellow",
};

function formatPrice(value?: number | null) {
  if (!value) return "";
  if (value >= 10000000) {
    return `${(value / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
  }
  if (value >= 100000) {
    return `${(value / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lac`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} K`;
  }
  return value.toLocaleString("en-IN");
}

export default function RequirementsPage() {
  const [data, setData] = useState<api.ParsedObservation[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    api.getParsed(PAGE_SIZE, offset).then(all => setData(all.filter(r => REQUIREMENT_TYPES.includes(r.message_type))));
  }, [offset]);

  return (
    <div>
      <div className="flex gap-2 mb-4 items-center">
        <button onClick={() => api.getParsed(PAGE_SIZE, offset).then(all => setData(all.filter(r => REQUIREMENT_TYPES.includes(r.message_type))))} className="px-3 py-1.5 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">ID</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Broker</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Type</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">BHK</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Budget</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Furnishing</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Location</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Market</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => {
              const pct = r.confidence ? (r.confidence * 100) : 0;
              const cColor = pct >= 70 ? "green" : pct >= 40 ? "yellow" : "red";
              return (
                <tr key={r.id} className="hover:bg-[var(--bg-surface)]">
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">
                    <a href={`/observations/${r.raw_message_id}`} className="text-[var(--blue)] font-semibold no-underline hover:underline">P{r.id}</a>
                    <div className="text-[10px] text-[var(--text-muted)]">{r.raw_group}</div>
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] font-semibold">
                    {r.broker_name || "—"}
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">
                    <span className={`badge ${typeColors[r.message_type] || "badge-blue"}`}>{r.message_type}</span>
                    <span className="prov prov-parsed">Parsed</span>
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.bhk}{r.bhk && <span className="prov prov-parsed">Parsed</span>}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{formatPrice(r.price)}{r.price ? <span className="prov prov-parsed">Parsed</span> : ""}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.furnishing || ""}{r.furnishing ? <span className="prov prov-parsed">Parsed</span> : ""}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[200px]">{r.location_raw}{r.location_raw && <span className="prov prov-parsed">Parsed</span>}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.micro_market}{r.micro_market && <span className="prov prov-enriched">Enriched</span>}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]"><span className={`badge badge-${cColor}`}>{pct.toFixed(0)}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 items-center mt-3">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm disabled:opacity-40">Prev</button>
        <span className="text-sm text-[var(--text-muted)]">{data.length > 0 ? `${offset + 1}–${offset + data.length}` : "0"}</span>
        <button disabled={data.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)} className="px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
