"use client";

import { useState, useEffect } from "react";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[] | null>(null);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    if (!initialQuery.trim()) return;
    setQuery(initialQuery);
    runSearch(initialQuery);
  }, []);

  async function runSearch(value: string) {
    if (!value.trim()) return;
    setResults(null);
    try {
      const data = await api.searchMessages(value);
      setResults(data);
    } catch (e: any) {
      setResults([]);
    }
  }

  async function handleSearch() {
    runSearch(query);
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">Search</h2>
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder='e.g. "2 bhk bandra west under 3cr", "lodha owner listings"...'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          className="flex-1 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-primary)]"
        />
        <button onClick={handleSearch} className="px-4 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Search</button>
      </div>

      {results === null ? (
        <div className="text-[var(--text-muted)] text-center py-10">Search over structured real estate data.</div>
      ) : results.length === 0 ? (
        <div className="text-[var(--text-muted)] text-center py-10">No results found.</div>
      ) : (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex gap-2 items-center mb-1 flex-wrap">
                {r.intent && <span className="badge badge-blue">{r.intent}</span>}
                {r.broker_name && <span className="text-sm font-semibold">{r.broker_name}</span>}
                {r.bhk && <span className="text-sm text-[var(--text-muted)]">{r.bhk}</span>}
                {r.price && <span className="text-sm text-[var(--text-muted)]">{formatBrokerPrice(Number(r.price))}</span>}
                {r.micro_market && <span className="text-sm text-[var(--text-muted)]">{r.micro_market}</span>}
              </div>
              <div className="text-sm">{r.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
