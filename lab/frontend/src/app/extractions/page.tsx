"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

const PAGE_SIZE = 50;
const LISTING_TYPES = ["SELLER", "RENTAL", "COMMERCIAL_SALE", "COMMERCIAL_RENTAL", "PRE_LAUNCH"];

const typeColors: Record<string, string> = {
  SELLER: "badge-green",
  RENTAL: "badge-yellow",
  COMMERCIAL_SALE: "badge-orange",
  COMMERCIAL_RENTAL: "badge-orange",
  PRE_LAUNCH: "badge-red",
};

function locationQuery(r: api.ParsedObservation): string {
  return [r.building_name, r.landmark_name, r.micro_market, r.location_raw].filter(Boolean).join(" ");
}

function demandQuery(r: api.ParsedObservation): string {
  return [
    "requirement",
    r.bhk,
    r.micro_market || r.location_raw,
    r.landmark_name && `near ${r.landmark_name}`,
    r.price && `under ${formatBrokerPrice(r.price)}`,
  ].filter(Boolean).join(" ");
}

function brokerQuery(r: api.ParsedObservation): string {
  return r.broker_phone || r.broker_name || "";
}

export default function ExtractionsPage() {
  const [data, setData] = useState<api.ParsedObservation[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    api.getParsed(PAGE_SIZE, offset).then(all => setData(all.filter(r => LISTING_TYPES.includes(r.message_type))));
  }, [offset]);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => api.getParsed(PAGE_SIZE, offset).then(all => setData(all.filter(r => LISTING_TYPES.includes(r.message_type))))} className="px-3 py-1.5 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">ID</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Broker</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Type</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">BHK</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Price</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Area</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Location</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Landmark</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Market</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Conf.</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => {
              const pct = r.confidence ? (r.confidence * 100) : 0;
              const cColor = pct >= 70 ? "green" : pct >= 40 ? "yellow" : "red";
              const phone = (r.broker_phone || "").replace(/[^0-9]/g, "").slice(-10);
              const waLink = phone.length === 10 ? `https://wa.me/91${phone}` : "";
              return (
                <tr key={r.id} className="hover:bg-[var(--bg-surface)]">
                <td className="px-2.5 py-2 border-b border-[var(--border)]">
                  <a href={`/observations/${r.raw_message_id}`} className="text-[var(--blue)] font-semibold no-underline hover:underline">P{r.id}</a>
                  <div className="text-[10px] text-[var(--text-muted)]">{r.raw_group}</div>
                </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] font-semibold">
                    {r.broker_name || "—"}
                    {waLink && <div><a href={waLink} target="_blank" className="text-[10px] text-[var(--blue)] no-underline">wa.me/{phone}</a></div>}
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">
                    <span className={`badge ${typeColors[r.message_type] || "badge-blue"}`}>{r.message_type}</span>
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.bhk}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{formatBrokerPrice(r.price)}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.area_sqft ? `${r.area_sqft.toLocaleString()} sqft` : ""}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[200px] truncate">
                    {r.location_raw}
                    {r.location?.tokens && (
                      <div className="text-[10px] text-[var(--blue)] mt-0.5">
                        {r.location.tokens.map((t, i) => (
                          <span key={i} className="loc-token">{t.text} <small className="text-[var(--text-muted)]">{t.kind}</small></span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[120px] truncate">{r.landmark_name}{r.landmark_name && <span className="prov prov-enriched">Enriched</span>}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.micro_market}{r.micro_market && <span className="prov prov-enriched">Enriched</span>}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]"><span className={`badge badge-${cColor}`}>{pct.toFixed(0)}%</span></td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] min-w-[190px]">
                    <div className="flex flex-wrap gap-2">
                      <a href={`/observations/${r.raw_message_id}`} className="text-xs font-semibold text-[var(--blue)] hover:underline">View</a>
                      <a href={`/search?q=${encodeURIComponent(demandQuery(r))}`} className="text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-2.5 py-1">Find demand</a>
                      {brokerQuery(r) && <a href={`/search?q=${encodeURIComponent(brokerQuery(r))}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Broker</a>}
                      {locationQuery(r) && <a href={`/search?q=${encodeURIComponent(locationQuery(r))}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Market</a>}
                    </div>
                  </td>
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
