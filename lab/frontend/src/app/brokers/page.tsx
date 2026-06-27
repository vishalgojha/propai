"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

type BrokerStat = {
  observation_count: number;
  listing_count: number;
  requirement_count: number;
};

type BrokerMarket = BrokerStat & {
  micro_market: string;
};

type BrokerBuilding = BrokerStat & {
  building_name: string;
};

type Broker = {
  id: number;
  name: string;
  phone?: string | null;
  observation_count: number;
  listing_count: number;
  requirement_count: number;
  group_count: number;
  avg_ticket?: number | null;
  last_seen_at?: string | null;
  markets?: BrokerMarket[];
  buildings?: BrokerBuilding[];
};

export default function BrokersPage() {
  const [brokers, setBrokers] = useState<Broker[]>([]);

  useEffect(() => {
    api.getBrokers().then(rows => setBrokers(rows as Broker[]));
  }, []);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold">Brokers</h2>
        <div className="text-sm text-[var(--text-muted)]">Relationship graph built from parsed observations</div>
      </div>
      {brokers.length === 0 ? (
        <div className="text-[var(--text-muted)]">No broker data yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Name</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Phone</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Obs.</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Listings</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Req.</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Groups</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Markets Served</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Buildings</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Avg Ticket</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((b, i) => (
                <tr key={b.id || b.name || i} className="hover:bg-[var(--bg-surface)]">
                  <td className="px-2.5 py-2 border-b border-[var(--border)] font-semibold">{b.name || "—"}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] text-[var(--text-muted)]">{b.phone || "—"}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{b.observation_count}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{b.listing_count}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{b.requirement_count}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{b.group_count}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] min-w-[180px]">
                    <ChipList items={(b.markets || []).map(m => `${m.micro_market} (${m.observation_count})`)} />
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] min-w-[160px]">
                    <ChipList items={(b.buildings || []).map(building => `${building.building_name} (${building.observation_count})`)} />
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{formatBrokerPrice(b.avg_ticket) || "—"}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] text-[var(--text-muted)] whitespace-nowrap">{formatDate(b.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => (
        <span key={item} className="loc-token">{item}</span>
      ))}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value.endsWith("Z") ? value : `${value}Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}
