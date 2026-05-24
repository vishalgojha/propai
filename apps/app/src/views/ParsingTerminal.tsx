import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';

type GroupHealth = {
  id: string;
  sessionLabel: string;
  groupId: string;
  groupName: string;
  lastMessageAt: string | null;
  lastParsedAt: string | null;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  status: string;
};

type ParserEvent = {
  id: string;
  sessionLabel: string | null;
  eventType: string;
  message: string;
  metadata: {
    remoteJid?: string;
    parsed?: number;
    total?: number;
    ignored_lines?: number;
  };
  createdAt: string;
};

const terminalPanelClass = 'terminal-panel rounded-none border border-[rgba(255,179,71,0.28)] bg-[rgba(5,8,10,0.94)]';

export default function ParsingTerminal() {
  const [groups, setGroups] = React.useState<GroupHealth[]>([]);
  const [events, setEvents] = React.useState<ParserEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const [groupResponse, eventResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.whatsapp.groupsHealth),
        backendApi.get(ENDPOINTS.whatsapp.events),
      ]);

      const nextGroups = Array.isArray(groupResponse.data)
        ? groupResponse.data.map((row: any, index: number) => ({
            id: String(row.id || row.groupId || `group-${index}`),
            sessionLabel: String(row.sessionLabel || 'default'),
            groupId: String(row.groupId || ''),
            groupName: String(row.groupName || row.groupId || 'Unnamed group'),
            lastMessageAt: row.lastMessageAt || null,
            lastParsedAt: row.lastParsedAt || null,
            messagesReceived24h: Number(row.messagesReceived24h || 0),
            messagesParsed24h: Number(row.messagesParsed24h || 0),
            messagesFailed24h: Number(row.messagesFailed24h || 0),
            status: String(row.status || 'unknown'),
          }))
        : [];

      const nextEvents = Array.isArray(eventResponse.data)
        ? eventResponse.data
            .filter((row: any) => String(row.eventType || '') === 'group_message_broadcast_parsed')
            .map((row: any, index: number) => ({
              id: String(row.id || `event-${index}`),
              sessionLabel: row.sessionLabel || null,
              eventType: String(row.eventType || ''),
              message: String(row.message || ''),
              metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
              createdAt: String(row.createdAt || ''),
            }))
        : [];

      setGroups(nextGroups.sort(sortGroups));
      setEvents(nextEvents);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const totals = React.useMemo(
    () =>
      groups.reduce(
        (acc, group) => {
          acc.received += group.messagesReceived24h;
          acc.parsed += group.messagesParsed24h;
          acc.failed += group.messagesFailed24h;
          if (isLiveGroup(group)) acc.live += 1;
          return acc;
        },
        { received: 0, parsed: 0, failed: 0, live: 0 },
      ),
    [groups],
  );
  const parseRate = totals.received > 0 ? Math.round((totals.parsed / totals.received) * 100) : 0;

  return (
    <main className="terminal-shell relative flex min-h-[calc(100vh-96px)] flex-col gap-4 overflow-hidden pb-6">
      <div className="terminal-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <header className="terminal-panel relative overflow-hidden border border-[rgba(255,179,71,0.3)] bg-[linear-gradient(180deg,rgba(22,28,30,0.98),rgba(7,9,11,0.96))] px-4 py-4 shadow-[0_0_0_1px_rgba(255,179,71,0.08),0_18px_50px_rgba(0,0,0,0.32)]">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,rgba(255,179,71,0.95),transparent)]" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#ffb347]">
              <span className="inline-flex items-center gap-2 rounded-none border border-[rgba(255,179,71,0.28)] bg-[rgba(255,179,71,0.08)] px-2 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#ffb347]" />
                Live Feed
              </span>
              <span className="text-[rgba(255,226,184,0.72)]">
                {lastRefresh ? `Last poll ${formatTime(lastRefresh.toISOString())}` : 'Booting feed'}
              </span>
            </div>
            <h1 className="mt-3 font-mono text-[30px] font-bold uppercase tracking-[0.08em] text-[#f7d39a]">
              Parsing Terminal
            </h1>
            <p className="mt-2 max-w-3xl font-mono text-[11px] uppercase tracking-[0.12em] text-[rgba(255,226,184,0.62)]">
              Group ingest health, parser throughput, and broadcast extraction wins in one live console.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric label="Groups" value={groups.length} tone="neutral" />
            <Metric label="Live" value={totals.live} tone="positive" />
            <Metric label="Received" value={totals.received} tone="neutral" />
            <Metric label="Parsed" value={totals.parsed} tone="positive" />
            <Metric label="Rate" value={`${parseRate}%`} tone={parseRate >= 60 ? 'positive' : 'warning'} />
          </div>
        </div>
      </header>

      {error && (
        <div className="terminal-panel relative border border-[rgba(255,107,61,0.42)] bg-[rgba(48,14,8,0.9)] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#ff8a5c]">
          Feed fault: {error}
        </div>
      )}

      <section className="relative grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.7fr)]">
        <div className={cn(terminalPanelClass, 'min-h-[620px] overflow-hidden')}>
          <PanelHeader
            left="Group matrix"
            right={`${totals.failed.toLocaleString('en-IN')} failures / 24h`}
          />
          <div className="terminal-table-header grid grid-cols-[minmax(0,1.35fr)_90px_90px_90px_90px_110px] gap-3 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[rgba(255,226,184,0.62)]">
            <span>Group</span>
            <span>Rx 24h</span>
            <span>Parsed</span>
            <span>Failed</span>
            <span>Rate</span>
            <span>Last seen</span>
          </div>
          <div className="pulse-scrollbar max-h-[calc(100vh-270px)] overflow-y-auto">
            {loading ? (
              <TerminalEmpty text="Loading parser state" />
            ) : groups.length === 0 ? (
              <TerminalEmpty text="No groups detected yet" />
            ) : (
              groups.map((group, index) => (
                <GroupRow key={`${group.sessionLabel}-${group.groupId}`} group={group} rowIndex={index} />
              ))
            )}
          </div>
        </div>

        <aside className="grid min-h-[620px] grid-cols-1 gap-4">
          <div className={cn(terminalPanelClass, 'overflow-hidden')}>
            <PanelHeader
              left="Recent parse wins"
              right={events.length > 0 ? `${events.length} visible` : 'Awaiting events'}
            />
            <div className="pulse-scrollbar max-h-[calc(50vh-120px)] space-y-0 overflow-y-auto">
              {events.length === 0 ? (
                <TerminalEmpty text="Waiting for parsed broadcast items" />
              ) : (
                events.map((event, index) => (
                  <ParseEvent key={event.id} event={event} groups={groups} index={index} />
                ))
              )}
            </div>
          </div>

          <div className={cn(terminalPanelClass, 'overflow-hidden')}>
            <PanelHeader left="Feed status" right="Rolling 5s poll" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <StatusBlock
                label="Coverage"
                value={`${totals.live}/${groups.length || 0}`}
                detail="Live groups"
                tone="positive"
              />
              <StatusBlock
                label="Parse efficiency"
                value={`${parseRate}%`}
                detail={`${totals.parsed.toLocaleString('en-IN')} of ${totals.received.toLocaleString('en-IN')}`}
                tone={parseRate >= 60 ? 'positive' : 'warning'}
              />
              <StatusBlock
                label="Dropouts"
                value={totals.failed.toLocaleString('en-IN')}
                detail="Failed in 24h"
                tone={totals.failed > 0 ? 'danger' : 'neutral'}
              />
              <StatusBlock
                label="Sync"
                value={lastRefresh ? formatTime(lastRefresh.toISOString()) : '--:--:--'}
                detail="Console clock"
                tone="neutral"
              />
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function PanelHeader({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[rgba(255,179,71,0.22)] bg-[rgba(255,179,71,0.04)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ffcf85]">
      <p>{left}</p>
      <p className="text-[rgba(255,226,184,0.62)]">{right}</p>
    </div>
  );
}

function GroupRow({ group, rowIndex }: { group: GroupHealth; rowIndex: number }) {
  const live = isLiveGroup(group);
  const parsedRatio = group.messagesReceived24h > 0 ? Math.round((group.messagesParsed24h / group.messagesReceived24h) * 100) : 0;
  const toneClass = parsedRatio >= 60 ? 'text-[#86efac]' : parsedRatio >= 30 ? 'text-[#ffcf85]' : 'text-[#ff8a5c]';

  return (
    <article
      className={cn(
        'grid grid-cols-[minmax(0,1.35fr)_90px_90px_90px_90px_110px] gap-3 border-b border-[rgba(255,179,71,0.12)] px-4 py-3 font-mono text-[11px] transition-colors',
        rowIndex % 2 === 0 ? 'bg-[rgba(255,179,71,0.03)]' : 'bg-transparent',
        live ? 'hover:bg-[rgba(255,179,71,0.08)]' : 'hover:bg-[rgba(255,179,71,0.05)]',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', live ? 'bg-[#ffb347] shadow-[0_0_10px_rgba(255,179,71,0.75)]' : 'bg-[rgba(255,226,184,0.35)]')} />
          <h2 className="truncate text-[12px] font-bold uppercase tracking-[0.04em] text-[#f7d39a]">{group.groupName}</h2>
          <span className={cn(
            'shrink-0 border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]',
            live
              ? 'border-[rgba(255,179,71,0.32)] bg-[rgba(255,179,71,0.1)] text-[#ffcf85]'
              : 'border-[rgba(255,226,184,0.14)] bg-transparent text-[rgba(255,226,184,0.44)]',
          )}>
            {live ? 'Live' : 'Idle'}
          </span>
        </div>
        <p className="mt-1 truncate text-[10px] text-[rgba(255,226,184,0.5)]">{group.sessionLabel} · {group.groupId}</p>
      </div>
      <Cell value={group.messagesReceived24h} align="right" />
      <Cell value={group.messagesParsed24h} align="right" tone="positive" />
      <Cell value={group.messagesFailed24h} align="right" tone={group.messagesFailed24h > 0 ? 'danger' : 'neutral'} />
      <Cell value={`${parsedRatio}%`} align="right" className={toneClass} />
      <Cell value={formatRelative(group.lastMessageAt || group.lastParsedAt)} align="right" />
    </article>
  );
}

function ParseEvent({ event, groups, index }: { event: ParserEvent; groups: GroupHealth[]; index: number }) {
  const remoteJid = String(event.metadata?.remoteJid || '');
  const group = groups.find((candidate) => candidate.groupId === remoteJid);
  const parsed = Number(event.metadata?.parsed || 0);
  const total = Number(event.metadata?.total || event.metadata?.parsed || 0);
  const ignored = Number(event.metadata?.ignored_lines || 0);

  return (
    <div
      className={cn(
        'border-b border-[rgba(255,179,71,0.12)] px-4 py-3 font-mono',
        index % 2 === 0 ? 'bg-[rgba(255,179,71,0.03)]' : 'bg-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-[#f7d39a]">
            {group?.groupName || remoteJid || 'Unknown group'}
          </p>
          <p className="mt-1 truncate text-[10px] text-[rgba(255,226,184,0.5)]">
            {(event.sessionLabel || 'default').toUpperCase()} · {formatStamp(event.createdAt)}
          </p>
        </div>
        <span className="border border-[rgba(134,239,172,0.28)] bg-[rgba(134,239,172,0.08)] px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[#86efac]">
          Parsed
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Parsed" value={parsed} tone="positive" />
        <MiniStat label="Total" value={total} tone="neutral" />
        <MiniStat label="Ignored" value={ignored} tone={ignored > 0 ? 'warning' : 'neutral'} />
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.08em] text-[rgba(255,226,184,0.62)]">
        {event.message || `${parsed} items extracted`} · {formatRelative(event.createdAt)} ago
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  tone?: 'positive' | 'warning' | 'neutral';
}) {
  return (
    <div className={cn('terminal-metric px-3 py-2', toneStyles[tone])}>
      <div className="font-mono text-[18px] font-bold tabular-nums uppercase tracking-[0.04em]">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[rgba(255,226,184,0.6)]">{label}</div>
    </div>
  );
}

function StatusBlock({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: keyof typeof toneStyles;
}) {
  return (
    <div className={cn('border px-3 py-3 font-mono', toneBoxStyles[tone])}>
      <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(255,226,184,0.56)]">{label}</p>
      <p className="mt-2 text-[20px] font-bold uppercase tracking-[0.04em]">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[rgba(255,226,184,0.62)]">{detail}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof toneStyles;
}) {
  return (
    <div className={cn('border px-2 py-2', toneBoxStyles[tone])}>
      <div className="text-[12px] font-bold tabular-nums">{value.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-[8px] uppercase tracking-[0.16em] text-[rgba(255,226,184,0.58)]">{label}</div>
    </div>
  );
}

function Cell({
  value,
  align,
  tone = 'neutral',
  className,
}: {
  value: number | string;
  align: 'left' | 'right';
  tone?: keyof typeof toneStyles;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'self-center text-[11px] uppercase tracking-[0.04em]',
        align === 'right' ? 'text-right' : 'text-left',
        toneStyles[tone],
        className,
      )}
    >
      {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
    </div>
  );
}

function TerminalEmpty({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 font-mono text-[11px] uppercase tracking-[0.12em] text-[rgba(255,226,184,0.52)]">
      &gt; {text}
    </div>
  );
}

const toneStyles = {
  positive: 'text-[#86efac]',
  warning: 'text-[#ffcf85]',
  danger: 'text-[#ff8a5c]',
  neutral: 'text-[#f7d39a]',
} as const;

const toneBoxStyles = {
  positive: 'border-[rgba(134,239,172,0.24)] bg-[rgba(134,239,172,0.06)] text-[#86efac]',
  warning: 'border-[rgba(255,207,133,0.24)] bg-[rgba(255,207,133,0.06)] text-[#ffcf85]',
  danger: 'border-[rgba(255,138,92,0.24)] bg-[rgba(255,138,92,0.06)] text-[#ff8a5c]',
  neutral: 'border-[rgba(255,179,71,0.2)] bg-[rgba(255,179,71,0.04)] text-[#f7d39a]',
} as const;

function isLiveGroup(group: GroupHealth) {
  const latest = group.lastMessageAt || group.lastParsedAt;
  if (!latest) return false;
  const age = Date.now() - new Date(latest).getTime();
  return Number.isFinite(age) && age < 10 * 60 * 1000;
}

function sortGroups(left: GroupHealth, right: GroupHealth) {
  const leftLive = isLiveGroup(left) ? 1 : 0;
  const rightLive = isLiveGroup(right) ? 1 : 0;
  if (leftLive !== rightLive) return rightLive - leftLive;
  return latestTime(right) - latestTime(left);
}

function latestTime(group: GroupHealth) {
  return Math.max(new Date(group.lastMessageAt || 0).getTime(), new Date(group.lastParsedAt || 0).getTime(), 0);
}

function formatRelative(value?: string | null) {
  if (!value) return 'Quiet';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Quiet';
  const seconds = Math.max(1, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatStamp(value?: string | null) {
  if (!value) return 'NO TS';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
