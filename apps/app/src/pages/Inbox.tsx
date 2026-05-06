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
    return 'this workspace is still on an older database shape, so Inbox is falling back to the direct-message log without the richer mirror metadata';
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
            ? 'Inbox endpoint is not live on this API build yet, so this view is using the saved direct-message log for now.'
            : `Inbox mirror is unavailable right now, so this view is using the saved direct-message log instead. (${sanitizeInboxError(primaryError)})`,
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

  return (
    <div className="h-[calc(100vh-10rem)] overflow-hidden rounded-[28px] border border-[#202c33] bg-[#111b21] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="grid h-full grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-r border-[#202c33] bg-[#111b21]">
          <div className="flex items-center justify-between border-b border-[#202c33] bg-[#202c33] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Inbox</p>
              <p className="text-[11px] text-[#8696a0]">
                Direct conversations only · {data?.summary.totalChats || 0} chats · {data?.summary.totalMessages || 0} messages
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadInbox()}
              className="inline-flex items-center gap-2 rounded-full bg-[#111b21] px-3 py-1.5 text-[11px] font-semibold text-[#d1d7db] transition-colors hover:text-white"
            >
              {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
              Refresh
            </button>
          </div>

          <div className="border-b border-[#202c33] bg-[#111b21] px-3 py-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search direct conversations"
                className="w-full rounded-lg border border-transparent bg-[#202c33] py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-[#8696a0] focus:border-[#00a884]"
              />
            </div>
          </div>

          {error ? (
            <div className={cn(
              'mx-3 mt-3 rounded-lg px-3 py-2 text-xs',
              error.includes('not live')
                ? 'bg-[#103529] text-[#d8fdd2]'
                : 'bg-[#32161a] text-[#ffd5d8]',
            )}>
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedChatId(chat.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-[#202c33] px-3 py-3 text-left transition-colors hover:bg-[#202c33]',
                  selectedChat?.id === chat.id && 'bg-[#2a3942]',
                )}
              >
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#233138] text-[#d1d7db]">
                  <SmartphoneIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-white">{chat.title}</p>
                    <span className="shrink-0 pt-0.5 text-[11px] text-[#8696a0]">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[13px] text-[#8696a0]">{chat.preview || 'No message text'}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[#8696a0]">
                    <span>{chat.messageCount} messages</span>
                  </div>
                </div>
              </button>
            ))}

            {!isLoading && chats.length === 0 ? (
              <div className="px-4 py-10 text-sm text-[#8696a0]">
                No direct conversations have landed in the inbox yet.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-col bg-[#0b141a]">
          <div className="flex items-center justify-between border-b border-[#202c33] bg-[#202c33] px-4 py-3">
            {selectedChat ? (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#233138] text-[#d1d7db]">
                    <SmartphoneIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{selectedChat.title}</p>
                    <p className="truncate text-[11px] text-[#8696a0]">
                      Follow-up lane · direct contact only · Last activity {formatTime(selectedChat.lastMessageAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[#8696a0]">
                  <MailIcon className="h-5 w-5" />
                  <CallbackIcon className="h-5 w-5" />
                </div>
              </>
            ) : (
              <p className="text-sm font-semibold text-white">Choose a conversation</p>
            )}
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25px 25px, rgba(255,255,255,0.02) 2px, transparent 0), radial-gradient(circle at 75px 75px, rgba(255,255,255,0.015) 2px, transparent 0)',
              backgroundSize: '100px 100px',
            }}
          >
            {selectedChat ? (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[78%] rounded-[10px] px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.25)]',
                      message.direction === 'outbound'
                        ? 'ml-auto bg-[#005c4b] text-white'
                        : 'bg-[#202c33] text-[#e9edef]',
                    )}
                  >
                    {message.direction === 'inbound' && message.sender ? (
                      <p className="mb-1 text-[11px] font-semibold text-[#53bdeb]">{message.sender}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-[13px] leading-6">{message.text || 'No message text'}</p>
                    <div className="mt-1 flex justify-end text-[10px] text-[#8696a0]">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#202c33] text-[#8696a0]">
                    <MessageSquareTextIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">WhatsApp-style inbox</h3>
                  <p className="mt-2 text-sm leading-6 text-[#8696a0]">
                    This is the direct follow-up lane for the broker team. Monitor shows all chats, while Inbox keeps only one-to-one conversations.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
