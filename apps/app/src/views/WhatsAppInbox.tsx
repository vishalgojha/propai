'use client';

import React from 'react';
import { Bot, CheckCircle2, ChevronRight, FileText, Inbox, Loader2, MessageSquare, Search, Send, Sparkles, UserRound } from 'lucide-react';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

type Thread = {
  remote_jid: string;
  title?: string | null;
  preview?: string | null;
  chat_type?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
  inbound_count?: number | null;
};

type ChatMessage = {
  id?: string;
  sender?: string | null;
  text?: string | null;
  timestamp?: string | null;
};

function timeAgo(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

function isOutbound(message: ChatMessage) {
  return /^(?:ai|propai ai|you)$/i.test(String(message.sender || '').trim());
}

function getTriage(text?: string | null) {
  const source = String(text || '');
  const propertySignals = /\b(?:\d(?:\.5)?\s*bhk|for\s+(?:sale|rent|lease)|available|requirement|client\s+(?:needs|looking)|₹|\b\d+\s*(?:cr|crore|lac|lakh|sq\.?\s*ft))\b/i;
  const strong = /\b(?:\d(?:\.5)?\s*bhk|for\s+(?:sale|rent|lease)|client\s+(?:needs|looking))\b/i;
  if (strong.test(source)) return { label: 'Ready to parse', tone: 'text-[var(--accent)] bg-[var(--accent-dim)] border-[color:var(--accent-border)]' };
  if (propertySignals.test(source)) return { label: 'Property signal', tone: 'text-amber-300 bg-amber-500/10 border-amber-400/30' };
  return { label: 'Conversation', tone: 'text-[var(--text-secondary)] bg-[var(--bg-elevated)] border-[color:var(--border)]' };
}

export function WhatsAppInbox() {
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [selected, setSelected] = React.useState<Thread | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [query, setQuery] = React.useState('');
  const [loadingThreads, setLoadingThreads] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadThreads = React.useCallback(async () => {
    setLoadingThreads(true);
    setError(null);
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.inboxThreads);
      const next = Array.isArray(response.data?.threads) ? response.data.threads as Thread[] : [];
      setThreads(next);
      setSelected((current) => current && next.some((thread) => thread.remote_jid === current.remote_jid) ? current : (next[0] || null));
    } catch (loadError) {
      setError(handleApiError(loadError));
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  React.useEffect(() => { void loadThreads(); }, [loadThreads]);

  React.useEffect(() => {
    if (!selected?.remote_jid) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    backendApi.get(ENDPOINTS.whatsapp.inboxMessages, { params: { remoteJid: selected.remote_jid } })
      .then((response) => {
        if (active) setMessages(Array.isArray(response.data?.messages) ? response.data.messages : []);
      })
      .catch((loadError) => active && setError(handleApiError(loadError)))
      .finally(() => active && setLoadingMessages(false));
    return () => { active = false; };
  }, [selected?.remote_jid]);

  const visibleThreads = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) => `${thread.title || ''} ${thread.preview || ''}`.toLowerCase().includes(normalized));
  }, [query, threads]);
  const latest = messages[messages.length - 1];
  const triage = getTriage(latest?.text || selected?.preview);

  return (
    <div className="h-[calc(100vh-5rem)] min-h-[620px] overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)]">
      <div className="grid h-full min-w-[980px] grid-cols-[310px_minmax(430px,1fr)_300px]">
        <aside className="border-r border-[color:var(--border)] bg-[var(--bg-base)]">
          <div className="border-b border-[color:var(--border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Inbox className="h-5 w-5 text-[var(--accent)]" /><h1 className="font-bold text-[var(--text-primary)]">PropAI Inbox</h1></div>
              <button onClick={() => void loadThreads()} className="rounded-lg border border-[color:var(--border)] p-2 text-[var(--text-secondary)] hover:text-[var(--accent)]" aria-label="Refresh chats"><Sparkles className="h-3.5 w-3.5" /></button>
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text-secondary)]"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" /></label>
          </div>
          <div className="h-[calc(100%-92px)] overflow-y-auto p-2">
            {loadingThreads ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /></div> : visibleThreads.map((thread) => (
              <button key={thread.remote_jid} onClick={() => setSelected(thread)} className={cn('w-full rounded-[12px] p-3 text-left transition-colors', selected?.remote_jid === thread.remote_jid ? 'bg-[var(--accent-dim)]' : 'hover:bg-[var(--bg-elevated)]')}>
                <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--accent)]"><UserRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{thread.title || 'WhatsApp chat'}</p><span className="text-[10px] text-[var(--text-muted)]">{timeAgo(thread.last_message_at)}</span></div><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-secondary)]">{thread.preview || 'No messages yet'}</p></div></div>
              </button>
            ))}
            {!loadingThreads && !visibleThreads.length ? <p className="p-5 text-center text-xs text-[var(--text-muted)]">No mirrored chats yet.</p> : null}
          </div>
        </aside>

        <main className="flex min-w-0 flex-col bg-[radial-gradient(circle_at_top,rgba(62,232,138,0.05),transparent_35%)]">
          <header className="flex h-[74px] items-center justify-between border-b border-[color:var(--border)] px-5"><div><p className="font-bold text-[var(--text-primary)]">{selected?.title || 'Select a chat'}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{selected?.chat_type === 'group' ? 'Approved group source' : 'Direct WhatsApp conversation'}</p></div><span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold', triage.tone)}>{triage.label}</span></header>
          <div className="flex-1 overflow-y-auto p-5">
            {loadingMessages ? <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /></div> : messages.map((message, index) => <div key={message.id || index} className={cn('mb-3 flex', isOutbound(message) ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[78%] rounded-[14px] px-4 py-3 text-sm leading-6', isOutbound(message) ? 'bg-[var(--accent)] text-[#061108]' : 'border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]')}><p className="whitespace-pre-wrap">{message.text || '[Media message]'}</p><p className={cn('mt-1 text-right text-[10px]', isOutbound(message) ? 'text-[#061108]/65' : 'text-[var(--text-muted)]')}>{message.sender || 'WhatsApp'} · {timeAgo(message.timestamp)}</p></div></div>)}
            {!loadingMessages && selected && !messages.length ? <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">No mirrored messages for this chat yet.</div> : null}
          </div>
          <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]">Mirror first. AI suggests actions; it does not send messages automatically.</div>
        </main>

        <aside className="border-l border-[color:var(--border)] bg-[var(--bg-base)] p-4">
          <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[var(--accent)]" /><div><p className="font-bold text-[var(--text-primary)]">AI workspace</p><p className="text-[11px] text-[var(--text-secondary)]">Evidence-first actions</p></div></div>
          <section className="mt-6 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Triage</p><p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{triage.label}</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">The original message remains the source of truth. Parsing only proceeds after a property signal passes the quality gate.</p></section>
          <section className="mt-4 space-y-2"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Suggested actions</p>{['Summarize this chat', 'Create property draft', 'Find matching requirements'].map((action) => <button key={action} disabled={!selected} className="flex w-full items-center justify-between rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-3 text-left text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40"><span>{action}</span><ChevronRight className="h-4 w-4 text-[var(--accent)]" /></button>)}</section>
          <section className="mt-6 border-t border-[color:var(--border)] pt-4"><div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><FileText className="h-4 w-4 text-[var(--accent)]" />{selected?.message_count || 0} mirrored messages</div><div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />No automatic outbound actions</div></section>
        </aside>
      </div>
      {error ? <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-red-500 px-4 py-2 text-xs text-white">{error}</div> : null}
    </div>
  );
}
