"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<any[]>([]);

  useEffect(() => {
    api.getBuildings().then(setBuildings);
  }, []);

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">Buildings</h2>
      {buildings.length === 0 ? (
        <div className="text-[var(--text-muted)]">No building data yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Name</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Market</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Developer</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Aliases</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b: any, i: number) => (
                <tr key={b.name || i} className="hover:bg-[var(--bg-surface)]">
                  <td className="px-2.5 py-2 border-b border-[var(--border)] font-semibold">{b.name}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{b.micro_market || "—"}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{b.developer || "—"}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] text-[var(--text-muted)]">{(b.aliases || []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
