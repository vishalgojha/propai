"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [g, a] = await Promise.all([api.getGroups(), api.getAllowlist()]);
      setGroups(g);
      setAllowlist(a);
  }

  const filtered = search
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;
  const parsedGroupCount = groups.filter(g => g.parsed?.is_real_estate || g.parsed?.markets?.length || g.parsed?.segments?.length).length;

  async function toggleGroup(g: any) {
    const newList = allowlist.includes(g.name)
      ? allowlist.filter(n => n !== g.name)
      : [...allowlist, g.name];
    await api.setAllowlist(newList);
    setAllowlist(newList);
    setGroups(groups.map(gr => gr.jid === g.jid ? { ...gr, allowed: !g.allowed } : gr));
  }

  async function allowAll() {
    const all = groups.map(g => g.name);
    await api.setAllowlist(all);
    setAllowlist(all);
    setGroups(groups.map(g => ({ ...g, allowed: true })));
  }

  async function clearAll() {
    await api.clearAllowlist();
    setAllowlist([]);
    setGroups(groups.map(g => ({ ...g, allowed: false })));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">WhatsApp Groups</h2>
        <div className="flex gap-2">
          <button onClick={refresh} className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-xs">Refresh</button>
          <button onClick={allowAll} className="px-3 py-1.5 bg-[var(--propai-green)] text-[#04100a] rounded-lg text-xs font-bold">Allow all</button>
          <button onClick={clearAll} className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-xs">Clear allowlist</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          ["Discovered", groups.length],
          ["Name Parsed", parsedGroupCount],
          ["Capture", "Live"],
          ["Window", "10-7"],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{value as number | string}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label as string}</div>
          </div>
        ))}
      </div>

      {groups.length > 0 && (
        <div className="mb-4 border border-[var(--border)] bg-[var(--bg-surface)] rounded-xl px-4 py-3 text-sm text-[var(--text-secondary)]">
          PropAI does not backfill old WhatsApp messages. Groups are parsed as routing context; messages are captured live from webhooks during 10 AM - 7 PM IST.
        </div>
      )}

      <input
        type="text"
        placeholder="Search groups..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-2 mb-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm"
      />

      {allowlist.length > 0 && (
        <div className="mb-4 text-xs text-[var(--text-muted)]">
          Tracking <strong className="text-[var(--text-primary)]">{allowlist.length}</strong> of {groups.length} groups
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-[var(--text-muted)] text-center py-10">No groups found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Name</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Parsed</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Members</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Mode</th>
                <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase">Track</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g, i) => (
                <tr key={g.jid || i} className="hover:bg-[var(--bg-surface)]">
                  <td className="px-2.5 py-2 border-b border-[var(--border)] font-semibold max-w-[240px] truncate" title={g.name}>{g.name}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)] min-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      {[...(g.parsed?.markets || []), ...(g.parsed?.segments || [])].length === 0 ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        [...(g.parsed?.markets || []), ...(g.parsed?.segments || [])].map((tag: string) => (
                          <span key={tag} className="badge badge-blue">{tag}</span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">{g.participants || "—"}</td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">
                    <span className="badge badge-green">live</span>
                  </td>
                  <td className="px-2.5 py-2 border-b border-[var(--border)]">
                    <button
                      onClick={() => toggleGroup(g)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${g.allowed ? 'bg-[var(--propai-green)] text-[#04100a] border-[var(--propai-green)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]'}`}
                    >
                      {g.allowed ? "ON" : "OFF"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
