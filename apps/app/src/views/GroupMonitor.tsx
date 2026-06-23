"use client";

import { useCallback, useEffect, useState } from "react";
import backendApi, { handleApiError } from "../services/api";
import { ENDPOINTS } from "../services/endpoints";

type GroupData = {
  groupJid: string;
  name: string;
  participantsCount: number;
  broadcastEnabled: boolean;
  classification: string;
  category: string;
  locality: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  sessionLabel: string | null;
};

export function GroupMonitor() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      setError(null);
      const response = await backendApi.get(ENDPOINTS.whatsapp.groups);
      setGroups(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const toggleMonitor = async (groupJid: string) => {
    try {
      await backendApi.patch(ENDPOINTS.whatsapp.groupToggleMonitor(groupJid));
      setGroups((prev) =>
        prev.map((g) =>
          g.groupJid === groupJid ? { ...g, broadcastEnabled: !g.broadcastEnabled } : g
        )
      );
    } catch (err) {
      console.error("Failed to toggle monitor", err);
    }
  };

  const monitored = groups.filter((g) => g.broadcastEnabled);
  const unmonitored = groups.filter((g) => !g.broadcastEnabled);

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Group Monitor</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">WhatsApp Group Management</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Toggle monitoring per group. Monitored groups&apos; messages are parsed into your Stream.
        </p>
      </section>

      {error ? (
        <section className="rounded-[16px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          Loading groups...
        </section>
      ) : groups.length === 0 ? (
        <section className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          No WhatsApp groups found. Connect a phone first.
        </section>
      ) : (
        <>
          <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
            <h3 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              Monitored ({monitored.length})
            </h3>
            {monitored.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No groups are being monitored.</p>
            ) : (
              <GroupTable groups={monitored} onToggle={toggleMonitor} />
            )}
          </section>

          <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
            <h3 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              Paused ({unmonitored.length})
            </h3>
            {unmonitored.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">All groups are being monitored.</p>
            ) : (
              <GroupTable groups={unmonitored} onToggle={toggleMonitor} />
            )}
          </section>
        </>
      )}
    </main>
  );
}

function GroupTable({
  groups,
  onToggle,
}: {
  groups: GroupData[];
  onToggle: (jid: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[color:var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <th className="py-2 pr-4">Group Name</th>
            <th className="py-2 pr-4">Members</th>
            <th className="py-2 pr-4">Messages</th>
            <th className="py-2 pr-4">Last Active</th>
            <th className="py-2 pr-4">Classification</th>
            <th className="py-2 text-right">Monitor</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.groupJid} className="border-b border-[color:var(--border)] last:border-0">
              <td className="py-3 pr-4">
                <div className="font-medium text-[var(--text-primary)] truncate max-w-[220px]">
                  {group.name || group.groupJid}
                </div>
                {group.locality ? (
                  <div className="text-[11px] text-[var(--text-muted)]">{group.locality}</div>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-[var(--text-secondary)]">{group.participantsCount}</td>
              <td className="py-3 pr-4 text-[var(--text-secondary)]">{group.messageCount}</td>
              <td className="py-3 pr-4 text-[var(--text-secondary)]">
                {group.lastMessageAt
                  ? new Date(group.lastMessageAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </td>
              <td className="py-3 pr-4">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  group.classification === "business"
                    ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                    : group.classification === "personal"
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                }`}>
                  {group.classification}
                </span>
              </td>
              <td className="py-3 text-right">
                <button
                  onClick={() => onToggle(group.groupJid)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                    group.broadcastEnabled ? "bg-[var(--accent)]/35" : "bg-[var(--bg-hover)]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full transition-all duration-200 ${
                      group.broadcastEnabled
                        ? "right-0.5 bg-[var(--accent)]"
                        : "left-0.5 bg-[var(--text-muted)]"
                    }`}
                  />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
