"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";

const PAGE_SIZE = 50;

export default function InboxPage() {
  const [messages, setMessages] = useState<api.RawMessage[]>([]);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getRaw(PAGE_SIZE, offset).then(setMessages);
  }, [offset]);

  const filtered = messages.filter(m => !search || m.message.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search message..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-primary)]"
        />
        <button onClick={() => api.getRaw(PAGE_SIZE, offset).then(setMessages)} className="px-3 py-1.5 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">ID</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Group</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Sender</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Message</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Type</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Timestamp</th>
              <th className="text-left px-2.5 py-2 border-b border-[var(--border-strong)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="hover:bg-[var(--bg-surface)]">
                <td className="px-2.5 py-2 border-b border-[var(--border)]">
                  <a href={`/observations/${m.id}`} className="text-[var(--blue)] no-underline hover:underline">#{m.id}</a>
                </td>
                <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[200px] truncate">{m.group_name}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[200px] truncate">{m.sender}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)] max-w-[300px] truncate">{m.message}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)]">{m.message_type ? <span className="badge badge-blue">{m.message_type}</span> : ""}</td>
                <td className="px-2.5 py-2 border-b border-[var(--border)] text-[var(--text-muted)]">{m.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 items-center mt-3">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm disabled:opacity-40">Prev</button>
        <span className="text-sm text-[var(--text-muted)]">{messages.length > 0 ? `${offset + 1}–${offset + messages.length}` : "0"}</span>
        <button disabled={messages.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)} className="px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
