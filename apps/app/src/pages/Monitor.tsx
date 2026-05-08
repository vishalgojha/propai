import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import {
  ActivityIcon,
  GroupsIcon,
  LoaderIcon,
  MessageSquareIcon,
  RefreshIcon,
  SearchIcon,
  SmartphoneIcon,
} from '../lib/icons';

type MonitorChat = {
  id: string;
  remoteJid: string;
  type: 'group' | 'direct';
  title: string;
  preview: string;
  lastMessageAt: string;
  sender?: string | null;
  locality?: string | null;
  city?: string | null;
  category?: string | null;
  tags: string[];
  participantsCount: number;
  broadcastEnabled: boolean;
  messageCount: number;
};

type MonitorMessage = {
  id: string;
  chatId: string;
  type: 'group' | 'direct';
  title: string;
  text: string;
  sender?: string | null;
  direction: 'inbound' | 'outbound';
  timestamp: string;
};

type MonitorResponse = {
  summary: {
    totalChats: number;
    directChats: number;
    groupChats: number;
    totalMessages: number;
    connectedSessions: number;
  };
  sessions: Array<{
    label: string;
    ownerName?: string | null;
    status: string;
    phoneNumber?: string | null;
    lastSync?: string | null;
  }>;
  chats: MonitorChat[];
  messages: MonitorMessage[];
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
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '--';

const formatDateTime = (value?: string | null) =>
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

const fallbackFromMessages = (rows: RawMessageRow[]): MonitorResponse => {
  const chatsMap = new Map<string, MonitorChat>();
  const messages: MonitorMessage[] = [];

  for (const row of rows) {
    const remoteJid = String(row.remote_jid || '');
    if (!remoteJid) continue;

    const isGroup = remoteJid.endsWith('@g.us');
    const timestamp = row.timestamp || row.created_at || new Date().toISOString();
    const text = String(row.message_text || row.text || '').trim();
    const title = isGroup
      ? String(row.sender || '').trim() || 'WhatsApp group'
      : buildDirectTitle(row);
    const direction = isOutboundSender(row.sender) ? 'outbound' : 'inbound';

    const existing = chatsMap.get(remoteJid) || {
      id: remoteJid,
      remoteJid,
      type: isGroup ? 'group' as const : 'direct' as const,
      title,
      preview: text,
      lastMessageAt: timestamp,
      sender: row.sender || null,
      tags: [],
      participantsCount: 0,
      broadcastEnabled: false,
      messageCount: 0,
    };

    existing.messageCount += 1;
    if (new Date(timestamp).getTime() >= new Date(existing.lastMessageAt).getTime()) {
      existing.preview = text;
      existing.lastMessageAt = timestamp;
      existing.sender = row.sender || null;
    }

    chatsMap.set(remoteJid, existing);
    messages.push({
      id: String(row.id || `${remoteJid}-${timestamp}`),
      chatId: remoteJid,
      type: isGroup ? 'group' : 'direct',
      title,
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
      directChats: chats.filter((chat) => chat.type === 'direct').length,
      groupChats: chats.filter((chat) => chat.type === 'group').length,
      totalMessages: messages.length,
      connectedSessions: 0,
    },
    sessions: [],
    chats,
    messages: messages.sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    ),
  };
};

const unwrapMonitorPayload = (data: any): MonitorResponse => ({
  summary: data?.summary || {
    totalChats: 0,
    directChats: 0,
    groupChats: 0,
    totalMessages: 0,
    connectedSessions: 0,
  },
  sessions: Array.isArray(data?.sessions) ? data.sessions : [],
  chats: Array.isArray(data?.chats) ? data.chats : [],
  messages: Array.isArray(data?.messages) ? data.messages : [],
});
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';

const sanitizeMonitorError = (message: string) => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('whatsapp_groups') ||
    normalized.includes('schema cache') ||
    normalized.includes('created_at does not exist') ||
    normalized.includes('message_text does not exist')
  ) {
    return 'this workspace is still on an older database shape, so group tags and richer mirror metadata are temporarily limited';
  }

  return message;
};

export const Monitor: React.FC = () => {
  const [data, setData] = React.useState<MonitorResponse | null>(null);
  const [selectedSessionLabel, setSelectedSessionLabel] = React.useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [selectedChatId, setSelectedChatId] = React.useState<string>('');
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadMonitor = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.monitor, {
        params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
      });
      const payload = unwrapMonitorPayload(response.data);
      setData(payload);
      setSelectedChatId((current) => current || payload.chats?.[0]?.id || '');
      return;
    } catch (err: any) {
      const primaryError = handleApiError(err);

      try {
        const fallback = await backendApi.get(ENDPOINTS.whatsapp.messages, {
          params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
        });
        const payload = fallbackFromMessages(Array.isArray(fallback.data) ? fallback.data : []);
        setData(payload);
        setSelectedChatId((current) => current || payload.chats?.[0]?.id || '');
        setError(
          err?.response?.status === 404
            ? 'Mirror endpoint is not live on this API build yet, so Monitor is using the saved message log for now.'
            : `Monitor mirror is unavailable right now, so this view is using the saved message log instead. (${sanitizeMonitorError(primaryError)})`,
        );
      } catch (fallbackErr) {
        setError(handleApiError(fallbackErr));
        setData(null);
      } finally {
        setIsLoading(false);
      }
      return;
    } finally {
      setIsLoading(false);
    }
  }, [selectedSessionLabel]);

  React.useEffect(() => {
    void loadMonitor();
  }, [loadMonitor]);

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

    return source.filter((chat) => {
      const haystack = [
        chat.title,
        chat.preview,
        chat.locality,
        chat.city,
        chat.category,
        ...(chat.tags || []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [data?.chats, search]);

  React.useEffect(() => {
    if (chats.length === 0) {
      setSelectedChatId('');
      return;
    }

    setSelectedChatId((current) => (
      current && chats.some((chat) => chat.id === current)
        ? current
        : chats[0]?.id || ''
    ));
  }, [chats]);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) || chats[0] || null;
  const visibleMessages = React.useMemo(
    () => (data?.messages || []).filter((message) => message.chatId === selectedChat?.id),
    [data?.messages, selectedChat?.id],
  );

  return (
    <div className="h-[calc(100vh-10rem)] overflow-hidden rounded-[28px] border border-[#202c33] bg-[#111b21] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="grid h-full grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-r border-[#202c33] bg-[#111b21]">
          <div className="flex items-center justify-between border-b border-[#202c33] bg-[#202c33] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Monitor</p>
              <p className="text-[11px] text-[#8696a0]">
                Live mirror of your WhatsApp activity (groups + DMs) · {data?.summary.totalChats || 0} chats · {data?.summary.groupChats || 0} groups
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadMonitor()}
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
                placeholder="Search groups and direct chats"
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
                  {chat.type === 'group' ? <GroupsIcon className="h-5 w-5" /> : <SmartphoneIcon className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-white">{chat.title}</p>
                    <span className="shrink-0 pt-0.5 text-[11px] text-[#8696a0]">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[13px] text-[#8696a0]">
                    {chat.sender ? `${chat.sender}: ` : ''}
                    {chat.preview || 'No message text'}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[#8696a0]">
                    <span>{chat.type === 'group' ? 'Group' : 'Direct'}</span>
                    {chat.locality ? <span>{chat.locality}</span> : null}
                  </div>
                </div>
              </button>
            ))}

            {!isLoading && chats.length === 0 ? (
              <div className="px-4 py-10 text-sm text-[#8696a0]">
                No WhatsApp chats have landed in the monitor yet.
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
                    {selectedChat.type === 'group' ? <GroupsIcon className="h-5 w-5" /> : <SmartphoneIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{selectedChat.title}</p>
                    <p className="truncate text-[11px] text-[#8696a0]">
                      {selectedChat.type === 'group'
                        ? `${selectedChat.participantsCount || 0} members`
                        : 'Direct conversation'} · Last seen {formatDateTime(selectedChat.lastMessageAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[#8696a0]">
                  <MessageSquareIcon className="h-5 w-5" />
                  <ActivityIcon className="h-5 w-5" />
                </div>
              </>
            ) : (
              <p className="text-sm font-semibold text-white">Choose a chat to monitor</p>
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
                {visibleMessages.map((message) => (
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
                      {formatDateTime(message.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#202c33] text-[#8696a0]">
                    <MessageSquareIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">WhatsApp Web style monitor</h3>
                  <p className="mt-2 text-sm leading-6 text-[#8696a0]">
                    Pick a group or direct conversation from the left and we’ll mirror the thread here using the workspace message log.
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
