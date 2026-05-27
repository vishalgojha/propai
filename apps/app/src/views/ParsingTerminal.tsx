import React from 'react';
import { RefreshCw, Pause, Play } from 'lucide-react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { rebuildStreamFromSavedMessages } from '../services/streamService';

type GroupHealth = {
  id: string;
  sessionLabel: string;
  groupId: string;
  groupName: string;
  signalScore?: number;
  noiseScore?: number;
  chaosScore?: number;
  participantsCount?: number;
  duplicateOverlapPercent?: number;
  reasons?: string[];
  lastMessageAt: string | null;
  lastParsedAt: string | null;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  status: string;
  isParsing?: boolean;
  behavior?: string | null;
};

type GroupAuditResponse = {
  sessionLabel: string;
  summary: {
    totalGroups: number;
    realEstateGroups: number;
    uniqueParticipants: number;
    duplicateParticipants: number;
    averageChaosScore: number;
    averageSignalScore: number;
  };
  groups: Array<{
    id: string;
    name: string;
    sessionLabel?: string | null;
    participantsCount: number;
    duplicateMemberCount: number;
    duplicateOverlapPercent: number;
    signalScore: number;
    noiseScore: number;
    chaosScore: number;
    reasons: string[];
  }>;
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

const terminalPanelClass =
  'terminal-panel rounded-none border border-[color:var(--accent-border)] bg-[rgba(9,13,18,0.94)]';

export default function ParsingTerminal() {
  const [groups, setGroups] = React.useState<GroupHealth[]>([]);
  const [events, setEvents] = React.useState<ParserEvent[]>([]);
  const [auditSummary, setAuditSummary] = React.useState<GroupAuditResponse['summary'] | null>(null);
  const [sessionLabel, setSessionLabel] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [actionGroupId, setActionGroupId] = React.useState<string | null>(null);
  const [dismissedPromptIds, setDismissedPromptIds] = React.useState<string[]>([]);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const [isRescanning, setIsRescanning] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const statusResponse = await backendApi.get(ENDPOINTS.whatsapp.status, { timeout: 15000 });
      const rawStatus = String(statusResponse.data?.status || 'disconnected');
      const nextConnected = rawStatus === 'connected' || rawStatus === 'connecting' || rawStatus === 'reconnecting';
      const statusSessions = Array.isArray(statusResponse.data?.sessions) ? statusResponse.data.sessions : [];
      const primarySession =
        statusSessions.find((session: any) => String(session?.status || '') === 'connected')
        || statusSessions.find((session: any) => String(session?.status || '') === 'connecting')
        || statusSessions.find((session: any) => String(session?.status || '') === 'reconnecting')
        || statusSessions[0]
        || null;
      const nextSessionLabel = String(primarySession?.label || statusResponse.data?.preferredOutboundSessionLabel || '').trim() || null;

      setIsConnected(nextConnected);
      setSessionLabel(nextSessionLabel);

      if (!nextConnected) {
        setGroups([]);
        setEvents([]);
        setAuditSummary(null);
        setError(null);
        setLastRefresh(new Date());
        return;
      }

      const auditRequest = nextSessionLabel
        ? backendApi.get<GroupAuditResponse>(ENDPOINTS.whatsapp.groupsAudit, {
            params: { sessionLabel: nextSessionLabel },
            timeout: 60000,
          })
        : Promise.resolve({ data: null } as any);

      const [auditResponse, groupResponse, eventResponse] = await Promise.all([
        auditRequest,
        backendApi.get(ENDPOINTS.whatsapp.groupsHealth),
        backendApi.get(ENDPOINTS.whatsapp.events),
      ]);

      const healthRows = Array.isArray(groupResponse.data)
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
            isParsing: typeof row.isParsing === 'boolean' ? row.isParsing : true,
            behavior: typeof row.behavior === 'string' ? row.behavior : null,
          }))
        : [];

      const healthByGroupId = new Map(
        healthRows
          .filter((row) => !nextSessionLabel || row.sessionLabel === nextSessionLabel)
          .filter((row) => Boolean(row.groupId))
          .map((row) => [row.groupId, row] as const),
      );

      const nextGroups = Array.isArray(auditResponse.data?.groups)
        ? auditResponse.data.groups.map((row: any, index: number) => {
            const health = healthByGroupId.get(String(row.id || '')) || null;
            return {
              id: String(row.id || `group-${index}`),
              sessionLabel: String(row.sessionLabel || nextSessionLabel || 'default'),
              groupId: String(row.id || ''),
              groupName: String(row.name || row.id || 'Unnamed group'),
              signalScore: Number(row.signalScore || 0),
              noiseScore: Number(row.noiseScore || 0),
              chaosScore: Number(row.chaosScore || 0),
              participantsCount: Number(row.participantsCount || 0),
              duplicateOverlapPercent: Number(row.duplicateOverlapPercent || 0),
              reasons: Array.isArray(row.reasons) ? row.reasons : [],
              lastMessageAt: health?.lastMessageAt || null,
              lastParsedAt: health?.lastParsedAt || null,
              messagesReceived24h: Number(health?.messagesReceived24h || 0),
              messagesParsed24h: Number(health?.messagesParsed24h || 0),
              messagesFailed24h: Number(health?.messagesFailed24h || 0),
              status: String(health?.status || 'active'),
              isParsing: health ? Boolean(health.isParsing) : true,
              behavior: typeof health?.behavior === 'string' ? health.behavior : 'Listen',
            };
          })
        : healthRows.filter((row) => !nextSessionLabel || row.sessionLabel === nextSessionLabel);

      const nextEvents = Array.isArray(eventResponse.data)
        ? eventResponse.data
            .filter((row: any) => String(row.eventType || '') === 'group_message_broadcast_parsed')
            .filter((row: any) => !nextSessionLabel || String(row.sessionLabel || '') === nextSessionLabel)
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
      setAuditSummary(auditResponse.data?.summary || null);
      setError(null);
      setInfoMessage(null);
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
    }, isConnected ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [isConnected, refresh]);

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
  const optedOutCount = groups.filter((group) => group.isParsing === false).length;
  const promptGroup = React.useMemo(
    () => groups.find((group) => shouldPromptForParsing(group) && !dismissedPromptIds.includes(group.groupId)) || null,
    [dismissedPromptIds, groups],
  );

  const handleRescanGroups = React.useCallback(async () => {
    if (!sessionLabel) return;
    setIsRescanning(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await backendApi.post(ENDPOINTS.whatsapp.rescanGroups, {
        sessionLabel,
      });
      const found = Number(response.data?.liveGroupsFound || 0);
      setInfoMessage(`Rescan complete. ${found} live groups synced.`);
      await refresh();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsRescanning(false);
    }
  }, [sessionLabel, refresh]);

  const handleSetGroupParsing = React.useCallback(async (group: GroupHealth, enabled: boolean) => {
    setActionGroupId(group.groupId);
    setError(null);
    setInfoMessage(null);
    try {
      await backendApi.patch(ENDPOINTS.whatsapp.toggleGroupParsing(group.groupId), { isParsing: enabled });
      if (enabled) {
        const result = await rebuildStreamFromSavedMessages(200, group.sessionLabel, group.groupId);
        setInfoMessage(`Parsing enabled for ${group.groupName}. Replayed ${result.scanned} saved messages and mapped ${result.ingested}.`);
      } else {
        setInfoMessage(`Parsing paused for ${group.groupName}.`);
      }
      setDismissedPromptIds((current) => [...new Set([...current, group.groupId])]);
      await refresh();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setActionGroupId(null);
    }
  }, [refresh]);

  return (
    <main className="terminal-shell relative flex min-h-[calc(100vh-96px)] flex-col gap-4 overflow-hidden pb-6">
      <div className="terminal-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <header className="terminal-panel relative overflow-hidden border border-[color:var(--accent-border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(9,13,18,0.96))] px-4 py-4 shadow-[0_0_0_1px_var(--accent-glow),0_18px_50px_rgba(0,0,0,0.32)]">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
              <span className="inline-flex items-center gap-2 rounded-none border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
                Live Feed
              </span>
              <span className="text-[var(--text-secondary)]">
                {sessionLabel ? `Session ${sessionLabel}` : 'Session unknown'}
              </span>
              <span className="text-[var(--text-secondary)]">
                {lastRefresh ? `Last poll ${formatTime(lastRefresh.toISOString())}` : 'Booting feed'}
              </span>
            </div>
            <h1 className="mt-3 font-mono text-[30px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
              Parsing Terminal
            </h1>
            <p className="mt-2 max-w-3xl font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              All groups parse by default. Opt out of groups you don't need. Rescan to discover newly joined groups.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => void handleRescanGroups()}
              disabled={isRescanning || !sessionLabel}
              className="flex items-center gap-2 border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)] disabled:opacity-60"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRescanning && 'animate-spin')} />
              {isRescanning ? 'Scanning...' : 'Rescan groups'}
            </button>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <Metric label="Groups" value={groups.length} tone="neutral" />
              <Metric label="Parsing" value={groups.length - optedOutCount} tone="positive" />
              <Metric label="Opted out" value={optedOutCount} tone={optedOutCount > 0 ? 'warning' : 'neutral'} />
              <Metric label="Live" value={totals.live} tone="positive" />
              {auditSummary ? (
                <>
                  <Metric label="Brokers" value={auditSummary.uniqueParticipants} tone="neutral" />
                  <Metric label="Overlap" value={`${auditSummary.duplicateParticipants > 0 ? Math.round((auditSummary.duplicateParticipants / auditSummary.uniqueParticipants) * 100) : 0}%`} tone={auditSummary.duplicateParticipants > 0 && (auditSummary.duplicateParticipants / auditSummary.uniqueParticipants) > 0.4 ? 'warning' : 'neutral'} />
                </>
              ) : (
                <>
                  <Metric label="Received" value={totals.received} tone="neutral" />
                  <Metric label="Parsed" value={totals.parsed} tone="positive" />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="terminal-panel relative border border-[rgba(239,68,68,0.34)] bg-[var(--red-dim)] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--red)]">
          Feed fault: {error}
        </div>
      )}

      {infoMessage && (
        <div className="terminal-panel relative border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--accent)]">
          {infoMessage}
        </div>
      )}

      {promptGroup && (
        <section className="terminal-panel relative overflow-hidden border border-[rgba(245,158,11,0.34)] bg-[rgba(30,24,10,0.94)] px-4 py-4 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Parsing alert</p>
              <h2 className="mt-2 font-mono text-[16px] font-bold uppercase tracking-[0.06em] text-[var(--text-primary)]">
                {promptGroup.groupName} is not parsing
              </h2>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                {describePromptReason(promptGroup)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSetGroupParsing(promptGroup, true)}
                disabled={actionGroupId === promptGroup.groupId}
                className="border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)] disabled:opacity-60"
              >
                {actionGroupId === promptGroup.groupId ? 'Parsing...' : 'Parse now'}
              </button>
              <button
                type="button"
                onClick={() => void handleSetGroupParsing(promptGroup, false)}
                disabled={actionGroupId === promptGroup.groupId}
                className="border border-[rgba(239,68,68,0.3)] bg-[var(--red-dim)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--red)] disabled:opacity-60"
              >
                Don&apos;t parse
              </button>
              <button
                type="button"
                onClick={() => setDismissedPromptIds((current) => [...new Set([...current, promptGroup.groupId])])}
                className="border border-[color:var(--border)] bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="relative grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.7fr)]">
        <div className={cn(terminalPanelClass, 'min-h-[620px] overflow-hidden')}>
          <PanelHeader
            left="Group matrix"
            right={auditSummary ? `${auditSummary.totalGroups} groups · ${auditSummary.uniqueParticipants.toLocaleString('en-IN')} brokers · ${optedOutCount} opted out` : `${totals.failed.toLocaleString('en-IN')} failures / 24h`}
          />
          <div className="terminal-table-header grid grid-cols-[minmax(0,1.35fr)_90px_90px_90px_90px_110px] gap-3 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
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
              <TerminalEmpty text={isConnected ? 'No groups detected yet' : 'WhatsApp is disconnected'} />
            ) : (
              groups.map((group, index) => (
                <GroupRow key={`${group.sessionLabel}-${group.groupId}`} group={group} rowIndex={index} onToggle={handleSetGroupParsing} />
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
              <TerminalEmpty text={isConnected ? 'Waiting for parsed broadcast items' : 'Connect WhatsApp to start parser monitoring'} />
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
                tooltip="Messages that failed parsing or ingestion in the last 24 hours."
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
    <div className="flex items-center justify-between border-b border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
      <p>{left}</p>
      <p className="text-[var(--text-secondary)]">{right}</p>
    </div>
  );
}

function GroupRow({ group, rowIndex, onToggle }: { group: GroupHealth; rowIndex: number; onToggle: (group: GroupHealth, enabled: boolean) => void }) {
  const live = isLiveGroup(group);
  const parsedRatio = group.messagesReceived24h > 0 ? Math.round((group.messagesParsed24h / group.messagesReceived24h) * 100) : 0;
  const toneClass = parsedRatio >= 60 ? 'text-[var(--accent)]' : parsedRatio >= 30 ? 'text-[var(--text-primary)]' : 'text-[var(--red)]';

  return (
    <article
      className={cn(
        'grid grid-cols-[minmax(0,1.35fr)_90px_90px_90px_90px_110px] gap-3 border-b border-[color:var(--border)] px-4 py-3 font-mono text-[11px] transition-colors',
        rowIndex % 2 === 0 ? 'bg-[rgba(62,232,138,0.02)]' : 'bg-transparent',
        live ? 'hover:bg-[rgba(62,232,138,0.06)]' : 'hover:bg-[var(--bg-hover)]',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', live ? 'bg-[var(--accent)] shadow-[0_0_10px_rgba(62,232,138,0.6)]' : 'bg-[var(--text-muted)]')} />
          <h2 className="truncate text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--text-primary)]">{group.groupName}</h2>
          <span className={cn(
            'shrink-0 border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]',
            live
              ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
              : 'border-[color:var(--border)] bg-transparent text-[var(--text-muted)]',
          )}>
            {live ? 'Live' : 'Idle'}
          </span>
          {group.isParsing === false ? (
            <span className="shrink-0 border border-[rgba(239,68,68,0.3)] bg-[var(--red-dim)] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[var(--red)]">
              Off
            </span>
          ) : null}
          {group.participantsCount ? (
            <span className="shrink-0 border border-[color:var(--border)] bg-transparent px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {group.participantsCount} members
            </span>
          ) : null}
          {group.duplicateOverlapPercent ? (
            <span className="shrink-0 border border-[color:var(--border)] bg-transparent px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {group.duplicateOverlapPercent}% overlap
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{group.sessionLabel} · {group.groupId}</p>
        {group.reasons?.length ? (
          <p className="mt-1 truncate text-[10px] text-[var(--text-secondary)]">
            {group.reasons.slice(0, 2).join(' · ')}
          </p>
        ) : null}
      </div>
      <Cell value={group.messagesReceived24h} align="right" />
      <Cell value={group.messagesParsed24h} align="right" tone="positive" />
      <Cell value={group.messagesFailed24h} align="right" tone={group.messagesFailed24h > 0 ? 'danger' : 'neutral'} />
      <Cell value={`${parsedRatio}%`} align="right" className={toneClass} />
      <div className="flex items-center justify-end gap-1 self-center">
        {group.isParsing === false ? (
          <button
            type="button"
            onClick={() => onToggle(group, true)}
            className="border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[var(--accent)]"
          >
            <Play className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(group, false)}
            className="border border-[rgba(239,68,68,0.3)] bg-[var(--red-dim)] px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[var(--red)]"
          >
            <Pause className="h-3 w-3" />
          </button>
        )}
      </div>
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
        'border-b border-[color:var(--border)] px-4 py-3 font-mono',
        index % 2 === 0 ? 'bg-[rgba(62,232,138,0.02)]' : 'bg-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-primary)]">
            {group?.groupName || remoteJid || 'Unknown group'}
          </p>
          <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">
            {(event.sessionLabel || 'default').toUpperCase()} · {formatStamp(event.createdAt)}
          </p>
        </div>
        <span className="border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[var(--accent)]">
          Parsed
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Parsed" value={parsed} tone="positive" />
        <MiniStat label="Total" value={total} tone="neutral" />
        <MiniStat label="Ignored" value={ignored} tone={ignored > 0 ? 'warning' : 'neutral'} />
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
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
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

function StatusBlock({
  label,
  value,
  detail,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  detail: string;
  tone: keyof typeof toneStyles;
  tooltip?: string;
}) {
  return (
    <div className={cn('border px-3 py-3 font-mono', toneBoxStyles[tone])}>
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        <span>{label}</span>
        {tooltip ? (
          <span
            title={tooltip}
            aria-label={tooltip}
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[color:var(--border)] text-[8px] leading-none text-[var(--text-secondary)] cursor-help"
          >
            i
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-[20px] font-bold uppercase tracking-[0.04em]">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-secondary)]">{detail}</p>
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
      <div className="mt-1 text-[8px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">{label}</div>
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
    <div className="px-4 py-8 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
      &gt; {text}
    </div>
  );
}

const toneStyles = {
  positive: 'text-[var(--accent)]',
  warning: 'text-[var(--text-primary)]',
  danger: 'text-[var(--red)]',
  neutral: 'text-[var(--text-primary)]',
} as const;

const toneBoxStyles = {
  positive: 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]',
  warning: 'border-[color:var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  danger: 'border-[rgba(239,68,68,0.24)] bg-[var(--red-dim)] text-[var(--red)]',
  neutral: 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
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

function shouldPromptForParsing(group: GroupHealth) {
  const recentMessage = group.lastMessageAt ? new Date(group.lastMessageAt).getTime() : 0;
  const recentThreshold = Date.now() - (6 * 60 * 60 * 1000);
  if (!Number.isFinite(recentMessage) || recentMessage <= 0 || recentMessage < recentThreshold) {
    return false;
  }

  if (group.isParsing === false) {
    return true;
  }

  return group.messagesReceived24h > 0 && group.messagesParsed24h === 0;
}

function describePromptReason(group: GroupHealth) {
  if (group.isParsing === false || group.behavior === 'Off') {
    return 'Recent messages are landing, but this group is currently paused. Enable parsing and replay the saved backlog now.';
  }

  return 'Recent messages were received from this group but none were parsed into the stream yet. Replay this group now or explicitly leave it off.';
}
