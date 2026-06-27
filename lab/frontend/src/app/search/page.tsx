"use client";

import { useState, useEffect } from "react";
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

function fmtPrice(price: number | null | undefined, unit?: string | null): string {
  if (price == null) return "";
  if (unit === "L" || unit === "lakh") return `₹${(price / 100000).toLocaleString("en-IN")} L`;
  if (unit === "Cr" || unit === "crore") return `₹${(price / 10000000).toLocaleString("en-IN")} Cr`;
  return formatBrokerPrice(price);
}

const intentLabel: Record<string, string> = {
  SELL: "For Sale", RENT: "For Rent", BUY: "Buying", "PRE-LAUNCH": "Pre-Launch",
  RENTAL_SEEKER: "Rental Seeker", COMMERCIAL: "Commercial",
};

const intentOrder = ["SELL", "RENT", "PRE-LAUNCH", "BUY", "RENTAL_SEEKER", "COMMERCIAL"];

const intentColor: Record<string, string> = {
  SELL: "badge-green", BUY: "badge-purple", RENT: "badge-yellow",
  COMMERCIAL: "badge-orange", "PRE-LAUNCH": "badge-red", RENTAL_SEEKER: "badge-purple",
};

function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, "").slice(-10);
  return clean.length === 10 ? `https://wa.me/91${clean}` : null;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [activeIntent, setActiveIntent] = useState<string | null>(null);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (!initialQuery.trim()) return;
    setQuery(initialQuery);
    runSearch(initialQuery);
  }, []);

  async function runSearch(value: string) {
    if (!value.trim()) return;
    setResults(null);
    setActiveIntent(null);
    try {
      const data = await api.searchMessages(value);
      setResults(data);
    } catch {
      setResults([]);
    }
  }

  function handleSearch() {
    const params = new URLSearchParams(window.location.search);
    params.set("q", query);
    window.history.replaceState({}, "", `?${params}`);
    runSearch(query);
  }

  const byIntent: Record<string, any[]> = {};
  if (results) {
    for (const r of results) {
      const key = r.intent || "OTHER";
      if (!byIntent[key]) byIntent[key] = [];
      byIntent[key].push(r);
    }
  }

  const sortedIntents = Object.keys(byIntent).sort(
    (a, b) => (intentOrder.indexOf(a) !== -1 ? intentOrder.indexOf(a) : 999)
      - (intentOrder.indexOf(b) !== -1 ? intentOrder.indexOf(b) : 999)
  );

  const filteredIntents = activeIntent
    ? sortedIntents.filter(i => i === activeIntent)
    : sortedIntents;

  const totalResults = results?.length ?? 0;

  return (
    <div>
      <a href="/" className="text-xs text-[var(--blue)] no-underline hover:underline">&larr; Dashboard</a>
      <h2 className="text-lg font-bold mt-3 mb-4">Search</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder='e.g. "2 bhk bandra west under 3cr", "lodha", "Crown Malad"...'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          className="flex-1 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-primary)]"
        />
        <button onClick={handleSearch} className="px-4 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold cursor-pointer">Search</button>
      </div>

      {results === null ? (
        <div className="text-[var(--text-muted)] text-center py-10">Search across all parsed messages.</div>
      ) : totalResults === 0 ? (
        <div className="text-[var(--text-muted)] text-center py-10">No results found.</div>
      ) : (
        <>
          <div className="text-sm text-[var(--text-muted)] mb-4">{totalResults} result{totalResults > 1 ? "s" : ""}</div>

          {/* ── Intent filters ── */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            <button
              onClick={() => setActiveIntent(null)}
              className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
                !activeIntent
                  ? "bg-[var(--accent)] text-[var(--on-propai-green)] border-[var(--accent)]"
                  : "bg-transparent text-[var(--text-secondary)] border-[var(--border-strong)] hover:border-[var(--text-muted)]"
              }`}
            >
              All
            </button>
            {sortedIntents.map(intent => (
              <button
                key={intent}
                onClick={() => setActiveIntent(activeIntent === intent ? null : intent)}
                className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
                  activeIntent === intent
                    ? "bg-[var(--accent)] text-[var(--on-propai-green)] border-[var(--accent)]"
                    : "bg-transparent text-[var(--text-secondary)] border-[var(--border-strong)] hover:border-[var(--text-muted)]"
                }`}
              >
                {intentLabel[intent] || intent} ({byIntent[intent].length})
              </button>
            ))}
          </div>

          {/* ── Results grouped by intent ── */}
          {filteredIntents.map(intent => (
            <div key={intent} className="mb-6">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-2">
                {intentLabel[intent] || intent} &middot; {byIntent[intent].length}
              </div>
              <div className="space-y-2">
                {byIntent[intent].map((r, i) => {
                  const w = waLink(r.broker_phone);
                  return (
                    <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`badge ${intentColor[r.intent] || "badge-blue"}`}>{r.intent}</span>
                            {r.building_name && <span className="text-sm font-bold text-[var(--text-primary)]">{r.building_name}</span>}
                            {r.micro_market && <span className="text-xs text-[var(--text-muted)]">{r.micro_market}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-[var(--text-secondary)]">
                            {r.bhk && <span>{r.bhk}</span>}
                            {r.area_sqft && <span>{Number(r.area_sqft).toLocaleString("en-IN")} sqft</span>}
                            {r.furnishing && <span>{r.furnishing}</span>}
                            {r.location_raw && <span>{r.location_raw}</span>}
                            {r.landmark_name && <span>near {r.landmark_name}</span>}
                          </div>
                          {r.message && (
                            <div className="mt-2 text-xs text-[var(--text-muted)] line-clamp-2">{r.message}</div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {r.price != null && (
                            <div className="text-sm font-bold text-[var(--text-primary)] whitespace-nowrap">
                              {r.price_unit ? fmtPrice(r.price, r.price_unit) : formatBrokerPrice(r.price)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border)]">
                        {r.broker_name && <span className="text-xs text-[var(--text-secondary)]">{r.broker_name}</span>}
                        {r.group_name && <span className="text-xs text-[var(--text-muted)]">{r.group_name}</span>}
                        {r.timestamp && <span className="text-xs text-[var(--text-muted)] ml-auto">{istTime(r.timestamp)}</span>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {w && (
                          <a href={w} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-green-600 hover:text-green-700 dark:text-green-400">Chat on WhatsApp</a>
                        )}
                        <a href={`/observations/${r.id}`} className="text-xs font-semibold text-[var(--blue)] hover:underline">Details</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
