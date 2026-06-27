"use client";

import { useEffect, useState, useCallback } from "react";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";
import { useEventStream } from "@/lib/useEventStream";

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

export default function DashboardPage() {
  const [activity, setActivity] = useState<api.DashboardActivity | null>(null);
  const [coverage, setCoverage] = useState<api.DashboardCoverage | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [wa, setWA] = useState<api.WhatsAppStatus | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [a, c, l, r, sig, h, s, w] = await Promise.all([
        api.getDashboardActivity(),
        api.getDashboardCoverage(),
        api.getDashboardListings(),
        api.getDashboardRequirements(),
        api.getDashboardSignals(),
        api.getDashboardHeatmap(),
        api.getStats(),
        api.getWhatsAppStatus(),
      ]);
      setActivity(a);
      setCoverage(c);
      setListings(l);
      setRequirements(r);
      setSignals(sig);
      setHeatmap(h);
      setStats(s);
      setWA(w);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Subscribe to SSE events — reload data on changes
  useEventStream({
    "message.received": loadAll,
    "extraction.completed": loadAll,
    "resolution.completed": loadAll,
    "sync.completed": loadAll,
    "connection.changed": loadAll,
  });

  const types = activity?.message_types || {};
  const obs = activity?.observation_types || {};
  const maxHeat = heatmap.length > 0 ? heatmap[0].c : 1;

  function renderListingBadge(intent: string) {
    const color = ({ SELL: "green", RENT: "yellow", "PRE-LAUNCH": "red", COMMERCIAL_SALE: "orange", COMMERCIAL_RENTAL: "orange" } as Record<string, string>)[intent] || "blue";
    return <span className={`badge badge-${color}`}>{intent === "COMMERCIAL_SALE" ? "CSALE" : intent === "COMMERCIAL_RENTAL" ? "CRENT" : intent}</span>;
  }

  function renderRequirementBadge(intent: string) {
    return <span className={`badge badge-${intent === "BUY" ? "purple" : "yellow"}`}>{intent === "RENTAL_SEEKER" ? "SEEK" : intent}</span>;
  }

  function locationQuery(item: any): string {
    return [item.building_name, item.landmark_name, item.micro_market, item.area].filter(Boolean).join(" ");
  }

  function listingMatchQuery(item: any): string {
    return ["requirement", item.bhk, item.micro_market || item.area, item.landmark_name && `near ${item.landmark_name}`, item.price && `under ${formatBrokerPrice(item.price)}`].filter(Boolean).join(" ");
  }

  function requirementMatchQuery(item: any): string {
    return ["listing", item.bhk, item.micro_market || item.area, item.landmark_name && `near ${item.landmark_name}`, item.price && `under ${formatBrokerPrice(item.price)}`].filter(Boolean).join(" ");
  }

  function brokerQuery(item: any): string {
    return item.broker_phone || item.broker_name || item.sender || "";
  }

  function signalIcon(type: string) {
    const icons: Record<string, string> = {
      trending_building: "🏢",
      active_market: "📍",
      unmatched_requirements: "⚠️",
      active_broker: "👤",
    };
    return icons[type] || "📊";
  }

  return (
    <div className="space-y-6">
      {/* Market Activity */}
      <div>
        <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">TODAY</div>
        <div className="flex gap-2.5 flex-wrap">
          {[
            { label: "Messages", val: activity?.messages_today ?? "—", color: "blue" },
            { label: "Listings", val: (obs.SELLER ?? 0) + (obs.RENTAL ?? 0) + (obs.COMMERCIAL_SALE ?? 0) + (obs.COMMERCIAL_RENTAL ?? 0) + (obs.PRE_LAUNCH ?? 0), color: "green" },
            { label: "Requirements", val: (obs.REQUIREMENT ?? 0) + (obs.RENTAL_SEEKER ?? 0), color: "purple" },
            { label: "Rentals", val: types.RENT ?? 0, color: "yellow" },
            { label: "Commercial", val: types.COMMERCIAL ?? 0, color: "orange" },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.color}`}>
              <div className="val">{s.val}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage + Accuracy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">MARKET MEMORY</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Groups", coverage?.groups_connected],
              ["Messages", coverage?.messages_stored],
              ["Buildings", coverage?.buildings_known],
              ["Landmarks", coverage?.landmarks_known],
              ["Developers", coverage?.developers_known],
              ["Markets", coverage?.micro_markets_known],
            ].map(([l, v]) => (
              <div key={l as string}>
                <div className="text-3xl font-bold text-[var(--text-primary)]">{v ?? "—"}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{l as string}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">RESOLVER ACCURACY</div>
          <div className="flex gap-2.5 flex-wrap mb-3">
            {[
              { label: "Auto", val: stats.resolved ?? 0, color: "green" },
              { label: "Review", val: stats.unresolved ?? 0, color: "yellow" },
              { label: "Failed", val: stats.errors ?? 0, color: "red" },
            ].map(s => (
              <div key={s.label} className={`stat-card ${s.color}`} style={{ minWidth: 80 }}>
                <div className="val" style={{ fontSize: 20 }}>{s.val}</div>
                <div className="lbl">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Avg Confidence: <strong className="text-[var(--text-primary)]">{stats.avg_accuracy ? (stats.avg_accuracy * 100).toFixed(1) + "%" : "—"}</strong>
            <span className="ml-3">Evaluated: <strong className="text-[var(--text-primary)]">{stats.evaluated ?? 0}</strong></span>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">KNOWLEDGE GRAPH</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Buildings", coverage?.buildings_known],
              ["Landmarks", coverage?.landmarks_known],
              ["Developers", coverage?.developers_known],
            ].map(([l, v]) => (
              <div key={l as string}>
                <div className="text-3xl font-bold text-[var(--text-primary)]">{v ?? "—"}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{l as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three-column feeds */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recent Listings */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">RECENT LISTINGS</div>
          <div className="max-h-[360px] overflow-y-auto">
            {listings.length === 0 ? (
              <div className="text-[var(--text-muted)] text-center py-5 text-xs">No listings yet</div>
            ) : (
              listings.map((f, i) => (
                <div key={i} className="feed-item">
                  <div className="feed-header">
                    {renderListingBadge(f.intent)}
                    {f.broker_name && <span className="font-semibold text-[var(--text-primary)] text-xs truncate ml-1">{f.broker_name}</span>}
                    <span className="feed-time ml-auto">{istTime(f.timestamp)}</span>
                  </div>
                  {f.building_name && <div className="text-sm font-bold text-[var(--text-primary)] mt-1">{f.building_name}</div>}
                  <div className="text-[13px] text-[var(--text-secondary)]">
                    {[f.bhk, f.furnishing, f.area_sqft ? `${f.area_sqft} sqft` : "", f.area, f.micro_market].filter(Boolean).join(" · ")}
                  </div>
                  {f.price && <div className="text-sm font-bold text-[var(--text-primary)] mt-1">{formatBrokerPrice(f.price)}</div>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`/observations/${f.id}`} className="text-xs font-semibold text-[var(--blue)] hover:underline">View</a>
                    <a href={`/search?q=${encodeURIComponent(listingMatchQuery(f))}`} className="text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-2.5 py-1">Find buyers</a>
                    {brokerQuery(f) && <a href={`/search?q=${encodeURIComponent(brokerQuery(f))}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Broker</a>}
                    {locationQuery(f) && <a href={`/search?q=${encodeURIComponent(locationQuery(f))}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Market</a>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Requirements */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">RECENT REQUIREMENTS</div>
          <div className="max-h-[360px] overflow-y-auto">
            {requirements.length === 0 ? (
              <div className="text-[var(--text-muted)] text-center py-5 text-xs">No requirements yet</div>
            ) : (
              requirements.map((f, i) => {
                const hasLocation = f.building_name || f.landmark_name || f.area || f.micro_market;
                const hasBroker = !!f.broker_name;
                const isComplete = hasLocation && hasBroker;
                return (
                  <div key={i} className="feed-item">
                    <div className="feed-header">
                      {renderRequirementBadge(f.intent)}
                      {f.broker_name && <span className="font-semibold text-[var(--text-primary)] text-xs truncate ml-1">{f.broker_name}</span>}
                      <span className="feed-time ml-auto">{istTime(f.timestamp)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {!hasLocation && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">No location</span>}
                      {!hasBroker && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">No broker</span>}
                      {f.forwarded === 1 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Forwarded</span>}
                    </div>
                    <div className="text-[13px] text-[var(--text-secondary)] mt-1">
                      {[f.bhk, f.furnishing, f.area, f.micro_market, f.landmark_name ? `near ${f.landmark_name}` : ""].filter(Boolean).join(" · ")}
                    </div>
                    {f.price && <div className="text-sm font-bold text-[var(--text-primary)] mt-1">Budget {formatBrokerPrice(f.price)}</div>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={`/observations/${f.id}`} className="text-xs font-semibold text-[var(--blue)] hover:underline">View</a>
                      {isComplete && (
                        <a href={`/search?q=${encodeURIComponent(requirementMatchQuery(f))}`} className="text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-2.5 py-1">Find listings</a>
                      )}
                      {brokerQuery(f) && <a href={`/search?q=${encodeURIComponent(brokerQuery(f))}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Broker</a>}
                      {locationQuery(f) && <a href={`/search?q=${encodeURIComponent(locationQuery(f))}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Market</a>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Market Signals */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">MARKET SIGNALS</div>
          <div className="max-h-[360px] overflow-y-auto">
            {signals.length === 0 ? (
              <div className="text-[var(--text-muted)] text-center py-5 text-xs">Not enough data for signals yet</div>
            ) : (
              signals.map((s, i) => (
                <div key={i} className="feed-item">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{signalIcon(s.type)}</span>
                    <div className="flex-1 min-w-0">
                      {s.type === "unmatched_requirements" && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          <span className="font-bold text-[var(--text-primary)]">{s.count}</span> unmatched requirement{s.count > 1 ? "s" : ""}
                        </div>
                      )}
                      {s.type === "trending_building" && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          <span className="font-bold text-[var(--text-primary)]">{s.label}</span> · {s.count} mention{s.count > 1 ? "s" : ""} today
                        </div>
                      )}
                      {s.type === "active_market" && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          <span className="font-bold text-[var(--text-primary)]">{s.label}</span> · {s.count} activit{s.count > 1 ? "ies" : "y"} today
                        </div>
                      )}
                      {s.type === "active_broker" && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          <span className="font-bold text-[var(--text-primary)]">{s.label}</span> posted {s.count} message{s.count > 1 ? "s" : ""} today
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">MARKET HEATMAP</div>
          <div className="max-h-[280px] overflow-y-auto">
            {heatmap.length === 0 ? (
              <div className="text-[var(--text-muted)] text-center py-3">No data yet</div>
            ) : (
              heatmap.slice(0, 15).map((h, i) => (
                <div key={i} className="heat-row">
                  <span className="heat-name">{h.micro_market}</span>
                  <div className="heat-bar"><div className="heat-fill" style={{ width: `${Math.max(3, (h.c / maxHeat) * 100)}%` }}></div></div>
                  <span className="heat-count">{h.c}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
