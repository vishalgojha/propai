"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";

export default function ObservationsPage() {
  const [data, setData] = useState<api.ParsedObservation[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => { api.getParsed(50, offset).then(setData); }, [offset]);

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">Observations</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">ID</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Broker</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Message</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Building</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="hover:bg-[var(--bg-surface)]">
                <td className="px-2.5 py-2 border-b border-[var(--border)] text-[var(--blue)]">P{r.id}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.broker_name || "—"}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[300px] truncate">{r.location_raw}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)]">{r.building_name || "—"}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)]">
                  {r.confidence != null && <span className={`badge ${r.confidence > 0.7 ? "badge-green" : r.confidence > 0.3 ? "badge-yellow" : "badge-red"}`}>{(r.confidence * 100).toFixed(0)}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
