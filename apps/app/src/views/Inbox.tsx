import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import {
  CallbackIcon,
  LoaderIcon,
  MailIcon,
  MessageSquareTextIcon,
  RefreshIcon,
  SearchIcon,
  SmartphoneIcon,
} from '../lib/icons';

type InboxChat = {
  id: string;
  remoteJid: string;
  title: string;
  preview: string;
  lastMessageAt: string;
  messageCount: number;
};

type InboxMessage = {
  id: string;
  chatId: string;
  text: string;
  sender?: string | null;
  direction: 'inbound' | 'outbound';
  timestamp: string;
};

type InboxResponse = {
  summary: {
    totalChats: number;
    totalMessages: number;
  };
  chats: InboxChat[];
  messages: InboxMessage[];
};

type RawMessageRow = {
  id?: string;
  remote_jid?: string;
  sender?: string | null;
  message_text?: string | null;
  text?: string | null;
  timestamp?: string | null;
  created_at?: string | null;
};

const formatTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '--';

const normalizePhone = (value?: string | null) => {
  const digits = String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
  return digits.length >= 10 ? digits : null;
};

const isOutboundSender = (sender?: string | null) => {
  const value = String(sender || '').trim().toLowerCase();
  return value === 'ai' || value.includes('@') || value.includes('broker') || value.includes('workspace');
};

const buildDirectTitle = (row: RawMessageRow) => {
  const sender = String(row.sender || '').trim();
  if (sender && !isOutboundSender(sender)) {
    return sender;
  }

  const phone = normalizePhone(String(row.remote_jid || '').split('@')[0]);
  return phone ? `+${phone}` : 'Direct contact';
};

const fallbackInboxFromMessages = (rows: RawMessageRow[]): InboxResponse => {
  const directRows = rows.filter((row) => !String(row.remote_jid || '').endsWith('@g.us'));
  const chatsMap = new Map<string, InboxChat>();
  const messages: InboxMessage[] = [];

  for (const row of directRows) {
    const remoteJid = String(row.remote_jid || '');
    if (!remoteJid) continue;

    const title = buildDirectTitle(row);
    const text = String(row.message_text || row.text || '').trim();
    const timestamp = row.timestamp || row.created_at || new Date().toISOString();
    const direction = isOutboundSender(row.sender) ? 'outbound' : 'inbound';

    const existing = chatsMap.get(remoteJid) || {
      id: remoteJid,
      remoteJid,
      title,
      preview: text,
      lastMessageAt: timestamp,
      messageCount: 0,
    };

    existing.messageCount += 1;
    if (new Date(timestamp).getTime() >= new Date(existing.lastMessageAt).getTime()) {
      existing.preview = text;
      existing.lastMessageAt = timestamp;
    }

    chatsMap.set(remoteJid, existing);
    messages.push({
      id: String(row.id || `${remoteJid}-${timestamp}`),
      chatId: remoteJid,
      text,
      sender: row.sender || null,
      direction,
      timestamp,
    });
  }

  const chats = Array.from(chatsMap.values()).sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );

  return {
    summary: {
      totalChats: chats.length,
      totalMessages: messages.length,
    },
    chats,
    messages: messages.sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    ),
  };
};

const unwrapInboxPayload = (data: any): InboxResponse => ({
  summary: data?.summary || {
    totalChats: 0,
    totalMessages: 0,
  },
  chats: Array.isArray(data?.chats) ? data.chats : [],
  messages: Array.isArray(data?.messages) ? data.messages : [],
});
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';

const sanitizeInboxError = (message: string) => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('whatsapp_groups') ||
    normalized.includes('schema cache') ||
    normalized.includes('created_at does not exist') ||
    normalized.includes('message_text does not exist')
  ) {
    return 'this workspace is still on an older database shape, so Threads is falling back to the direct-message log without the richer thread metadata';
  }

  return message;
};

export const Inbox: React.FC = () => {
  const [data, setData] = React.useState<InboxResponse | null>(null);
  const [selectedSessionLabel, setSelectedSessionLabel] = React.useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [selectedChatId, setSelectedChatId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadInbox = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.inbox, {
        params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
      });
      const payload = unwrapInboxPayload(response.data);
      setData(payload);
      setSelectedChatId((current) => current || payload.chats?.[0]?.id || '');
      return;
    } catch (err: any) {
      const primaryError = handleApiError(err);

      try {
        const fallback = await backendApi.get(ENDPOINTS.whatsapp.messages);
        const payload = fallbackInboxFromMessages(Array.isArray(fallback.data) ? fallback.data : []);
        setData(payload);
        setSelectedChatId((current) => current || payload.chats?.[0]?.id || '');
        setError(
          err?.response?.status === 404
            ? 'Threads endpoint is not live on this API build yet, so this view is using the saved direct-message log for now.'
            : `Threads history is unavailable right now, so this view is using the saved direct-message log instead. (${sanitizeInboxError(primaryError)})`,
        );
      } catch (fallbackErr) {
        setError(handleApiError(fallbackErr));
        setData(null);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    setIsLoading(false);
  }, [selectedSessionLabel]);

  React.useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  React.useEffect(() => {
    const handleSelectedSession = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string | null }>).detail;
      setSelectedSessionLabel(detail?.label || null);
    };

    window.addEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    return () => {
      window.removeEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    };
  }, []);

  const chats = React.useMemo(() => {
    const source = data?.chats || [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((chat) => `${chat.title} ${chat.preview}`.toLowerCase().includes(normalized));
  }, [data?.chats, search]);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) || chats[0] || null;
  const messages = React.useMemo(
    () => (data?.messages || []).filter((message) => message.chatId === selectedChat?.id),
    [data?.messages, selectedChat?.id],
  );
  const inboundMessages = React.useMemo(
    () => messages.filter((message) => message.direction === 'inbound'),
    [messages],
  );
  const outboundMessages = messages.length - inboundMessages.length;
  const queueCards = [
    {
      label: 'Active threads',
      value: chats.length,
      note: selectedSessionLabel ? 'Scoped to selected session' : 'Across the current workspace lane',
    },
    {
      label: 'Need response',
      value: chats.filter((chat) => chat.preview && !chat.preview.startsWith('You:')).length,
      note: 'Use this as a working queue, not a message archive',
    },
    {
      label: 'Messages loaded',
      value: data?.summary.totalMessages || 0,
      note: 'Saved direct-message log available to the workspace',
    },
  ];
  const selectedPhone = selectedChat ? normalizePhone(selectedChat.remoteJid.split('@')[0]) : null;
  const lastInboundAt = inboundMessages[inboundMessages.length - 1]?.timestamp || null;

  return (
    <div className="h-[calc(100vh-10rem)] overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[linear-gradient(180deg,#0b1220_0%,#0f1724_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <aside className="hidden h-full flex-col border-r border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.88)] lg:flex">
          <div className="border-b border-[rgba(148,163,184,0.14)] px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7dd3fc]">Threads</p>
                <p className="mt-1 text-lg font-semibold text-white">Conversation workspace</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-400">
                  Work direct-message lanes as operational threads tied to the current WhatsApp session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadInbox()}
                className="inline-flex items-center gap-2 rounded-full border border-[rgba(148,163,184,0.18)] bg-[rgba(15,23,36,0.9)] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:border-[#7dd3fc] hover:text-white"
              >
                {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-b border-[rgba(148,163,184,0.14)] px-3 py-3">
            {queueCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.9)] px-3 py-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{card.value}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="border-b border-[rgba(148,163,184,0.14)] px-3 py-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search threads, names, or last message"
                className="w-full rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.9)] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#7dd3fc]"
              />
            </div>
          </div>

          {error ? (
            <div className={cn(
              'mx-3 mt-3 rounded-2xl px-3 py-3 text-xs leading-5',
              error.includes('not live')
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                : 'border border-amber-500/20 bg-amber-500/10 text-amber-100',
            )}>
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedChatId(chat.id)}
                className={cn(
                  'mb-2 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                  selectedChat?.id === chat.id
                    ? 'border-[#7dd3fc]/40 bg-[#112031]'
                    : 'border-[rgba(148,163,184,0.08)] bg-[rgba(15,23,36,0.7)] hover:border-[rgba(148,163,184,0.18)] hover:bg-[rgba(20,31,48,0.92)]',
                )}
              >
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(125,211,252,0.1)] text-[#7dd3fc]">
                  <MessageSquareTextIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-white">{chat.title}</p>
                    <span className="shrink-0 pt-0.5 text-[11px] text-slate-500">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-400">{chat.preview || 'No message text'}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <span>{chat.messageCount} messages</span>
                    {selectedChat?.id === chat.id ? <span className="text-[#7dd3fc]">Active</span> : null}
                  </div>
                </div>
              </button>
            ))}

            {!isLoading && chats.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-500">
                No direct-message threads are available yet.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-col bg-[rgba(9,14,24,0.72)]">
          <div className="border-b border-[rgba(148,163,184,0.14)] px-5 py-4">
            {selectedChat ? (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(125,211,252,0.1)] text-[#7dd3fc]">
                      <SmartphoneIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-white">{selectedChat.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-slate-400">
                        Direct thread · last activity {formatTime(selectedChat.lastMessageAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-slate-500">
                  <MailIcon className="h-5 w-5" />
                  <CallbackIcon className="h-5 w-5" />
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-white">Choose a thread</p>
            )}
          </div>

          <div className="border-b border-[rgba(148,163,184,0.14)] px-4 py-3 lg:hidden">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search threads"
                className="w-full rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.9)] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#7dd3fc]"
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => setSelectedChatId(chat.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium',
                    selectedChat?.id === chat.id
                      ? 'border-[#7dd3fc]/40 bg-[#112031] text-white'
                      : 'border-[rgba(148,163,184,0.12)] bg-[rgba(15,23,36,0.8)] text-slate-400',
                  )}
                >
                  {chat.title}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {selectedChat ? (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[78%] rounded-2xl border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.16)]',
                      message.direction === 'outbound'
                        ? 'ml-auto border-emerald-500/20 bg-emerald-500/12 text-white'
                        : 'border-[rgba(148,163,184,0.12)] bg-[rgba(15,23,36,0.95)] text-slate-100',
                    )}
                  >
                    {message.direction === 'inbound' && message.sender ? (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7dd3fc]">{message.sender}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-[13px] leading-6">{message.text || 'No message text'}</p>
                    <div className="mt-2 flex justify-end text-[10px] text-slate-500">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(148,163,184,0.08)] text-slate-500">
                    <MessageSquareTextIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">Thread workspace</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Use this surface to work live conversation threads as operational lanes for reply, tagging, AI context, and follow-up.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="hidden h-full flex-col border-l border-[rgba(148,163,184,0.14)] bg-[rgba(12,18,29,0.92)] xl:flex">
          <div className="border-b border-[rgba(148,163,184,0.14)] px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Context</p>
              <p className="mt-1 text-lg font-semibold text-white">Operator panel</p>
              <p className="mt-1 text-[12px] leading-5 text-slate-400">
                Keep identity, AI context, and next-step actions beside the active thread.
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.9)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Identity</p>
              <p className="mt-2 text-base font-semibold text-white">{selectedChat?.title || 'No thread selected'}</p>
              <p className="mt-1 text-[12px] text-slate-400">{selectedPhone ? `+91 ${selectedPhone}` : 'Select a thread to inspect the contact lane.'}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div className="rounded-xl bg-[rgba(148,163,184,0.06)] px-3 py-2">
                  <p className="uppercase tracking-[0.08em] text-slate-500">Inbound</p>
                  <p className="mt-1 text-lg font-semibold text-white">{inboundMessages.length}</p>
                </div>
                <div className="rounded-xl bg-[rgba(148,163,184,0.06)] px-3 py-2">
                  <p className="uppercase tracking-[0.08em] text-slate-500">Outbound</p>
                  <p className="mt-1 text-lg font-semibold text-white">{outboundMessages}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.9)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">AI context</p>
              <p className="mt-2 text-sm font-medium text-white">What this lane is for</p>
              <p className="mt-2 text-[12px] leading-6 text-slate-400">
                Use Threads as the broker operations layer: read the direct-message lane, summarize context, decide the next action, and hand qualified brokers into WaBro or Stream flows.
              </p>
              <div className="mt-3 space-y-2 text-[12px] text-slate-300">
                <div className="rounded-xl bg-[rgba(148,163,184,0.06)] px-3 py-2">Summarize the conversation before acting.</div>
                <div className="rounded-xl bg-[rgba(148,163,184,0.06)] px-3 py-2">Tag the contact as broker, buyer, seller, or follow-up target.</div>
                <div className="rounded-xl bg-[rgba(148,163,184,0.06)] px-3 py-2">Convert useful messages into listings, requirements, or outreach lists.</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,36,0.9)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Next actions</p>
              <div className="mt-3 space-y-2 text-[12px] text-slate-300">
                <div className="rounded-xl border border-[rgba(148,163,184,0.1)] px-3 py-2">Draft reply in AI Agent</div>
                <div className="rounded-xl border border-[rgba(148,163,184,0.1)] px-3 py-2">Add broker to WaBro contact flow</div>
                <div className="rounded-xl border border-[rgba(148,163,184,0.1)] px-3 py-2">Create listing or requirement from latest message</div>
                <div className="rounded-xl border border-[rgba(148,163,184,0.1)] px-3 py-2">Schedule follow-up from this thread</div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Last inbound message {lastInboundAt ? formatTime(lastInboundAt) : 'not available'}.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
