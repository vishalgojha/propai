"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

const PAGE_SIZE = 50;

function istDate(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

function fmtPrice(price: number | null | undefined, unit?: string | null): string {
  if (price == null) return "";
  if (unit === "L" || unit === "lakh") return `₹${(price / 100000).toLocaleString("en-IN")} L`;
  if (unit === "Cr" || unit === "crore") return `₹${(price / 10000000).toLocaleString("en-IN")} Cr`;
  return formatBrokerPrice(price);
}

const intentColor: Record<string, string> = {
  SELL: "badge-green", RENT: "badge-yellow",
  "PRE-LAUNCH": "badge-red", COMMERCIAL: "badge-orange",
};

function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, "").slice(-10);
  return clean.length === 10 ? `https://wa.me/91${clean}` : null;
}

export default function ListingsPage() {
  const [data, setData] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);

  function load() {
    api.getParsed(PAGE_SIZE, offset, "SELL,RENT,PRE-LAUNCH,COMMERCIAL").then(setData);
  }

  useEffect(() => { load(); }, [offset]);

  return (
    <div>
      <a href="/" className="text-xs text-[var(--blue)] no-underline hover:underline">&larr; Dashboard</a>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <h2 className="text-lg font-bold">Listings</h2>
        <button onClick={load} className="px-3 py-1 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold cursor-pointer">Refresh</button>
      </div>

      <div className="space-y-2">
        {data.map(r => {
          const w = waLink(r.broker_phone);
          const fields: string[] = [];
          if (r.bhk) fields.push(r.bhk);
          if (r.area_sqft) fields.push(`${Number(r.area_sqft).toLocaleString("en-IN")} sqft`);
          if (r.furnishing) fields.push(r.furnishing);
          if (r.area) fields.push(r.area);
          if (r.location_raw) fields.push(r.location_raw);
          if (r.landmark_name) fields.push(`near ${r.landmark_name}`);

          return (
            <div key={r.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${intentColor[r.intent] || "badge-blue"}`}>{r.intent}</span>
                    {r.building_name && <span className="text-sm font-bold text-[var(--text-primary)]">{r.building_name}</span>}
                    {r.micro_market && <span className="text-xs text-[var(--text-muted)]">{r.micro_market}</span>}
                  </div>
                  {fields.length > 0 && (
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">{fields.join(" · ")}</div>
                  )}
                  {r.raw_message && (
                    <div className="mt-2 text-xs text-[var(--text-muted)] line-clamp-2">{r.raw_message}</div>
                  )}
                </div>
                {r.price != null && (
                  <div className="text-sm font-bold text-[var(--text-primary)] whitespace-nowrap flex-shrink-0">
                    {r.price_unit ? fmtPrice(r.price, r.price_unit) : formatBrokerPrice(r.price)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border)]">
                {r.broker_name && <span className="text-xs text-[var(--text-secondary)]">{r.broker_name}</span>}
                {r.raw_group && <span className="text-xs text-[var(--text-muted)]">{r.raw_group}</span>}
                {r.raw_timestamp && <span className="text-xs text-[var(--text-muted)] ml-auto">{istDate(r.raw_timestamp)}</span>}
              </div>
              <div className="flex gap-2 mt-2">
                {w && (
                  <a href={w} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-green-600 hover:text-green-700 dark:text-green-400">Chat on WhatsApp</a>
                )}
                <a href={`/observations/${r.raw_message_id}`} className="text-xs font-semibold text-[var(--blue)] hover:underline">Details</a>
              </div>
            </div>
          );
        })}
      </div>

      {data.length === 0 && (
        <div className="text-[var(--text-muted)] text-center py-10">No listings found.</div>
      )}

      <div className="flex gap-2 items-center mt-3">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm disabled:opacity-40 cursor-pointer">Prev</button>
        <span className="text-sm text-[var(--text-muted)]">{data.length > 0 ? `${offset + 1}–${offset + data.length}` : "0"}</span>
        <button disabled={data.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)} className="px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm disabled:opacity-40 cursor-pointer">Next</button>
      </div>
    </div>
  );
}
