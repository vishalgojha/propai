import React from 'react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import {
  CallbackIcon,
  LoaderIcon,
  MessageSquareTextIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from '../lib/icons';

type InboxChat = {
  id: string;
  remoteJid: string;
  title: string;
  preview: string;
  lastMessageAt: string;
  messageCount: number;
  type?: 'direct' | 'group';
  intel?: InboxThreadIntel;
  governance?: {
    state: ThreadGovernanceState;
    reason: string;
    confidence: 'high' | 'medium';
    override: boolean;
  };
};

type InboxThreadIntel = {
  summary: string;
  contact: {
    phone: string | null;
    role: 'broker' | 'buyer' | 'seller' | 'tenant' | 'owner' | 'unknown';
    confidence: 'high' | 'medium';
    localities: string[];
    propertyTypes: string[];
    budgets: string[];
  };
  thread: {
    inboundCount: number;
    outboundCount: number;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    requirementSignals: string[];
  };
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
  sessions?: InboxSessionSummary[];
  chats: InboxChat[];
  messages: InboxMessage[];
};

type InboxSessionSummary = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status?: 'connected' | 'connecting' | 'disconnected' | string;
  lastSync?: string | null;
};

type InboxMessagesResponse = {
  chatId: string;
  messages: InboxMessage[];
  pagination?: {
    limit: number;
    hasMore: boolean;
    nextBefore: string | null;
  };
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

type ThreadGovernanceState = 'allowed' | 'held' | 'ignored';

type ThreadSignal = {
  suggestedState: ThreadGovernanceState;
  reason: string;
  confidence: 'high' | 'medium';
};

const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';
const REAL_ESTATE_KEYWORDS = [
  'buyer',
  'seller',
  'tenant',
  'landlord',
  'owner',
  'broker',
  'realtor',
  'agent',
  'property',
  'listing',
  'inventory',
  'rent',
  'rental',
  'lease',
  'sale',
  'resale',
  'bhk',
  'flat',
  'apartment',
  'villa',
  'plot',
  'commercial',
  'office',
  'warehouse',
  'shop',
  'sqft',
  'budget',
  'cr',
  'lac',
  'lakh',
  'crore',
  'locality',
  'site visit',
];
const LOW_SIGNAL_PATTERNS = [
  'good morning',
  'good night',
  'happy birthday',
  'happy anniversary',
  'festival wishes',
  'okay',
  'thanks',
  'thank you',
];
const BLOCKED_LINK_PATTERNS = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'instagr.am',
  'facebook.com',
  'fb.watch',
  'x.com',
  'twitter.com',
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasKeywordMatch = (haystack: string, keyword: string) => {
  const pattern = keyword.includes(' ')
    ? `(^|[^a-z0-9])${escapeRegex(keyword)}($|[^a-z0-9])`
    : `\\b${escapeRegex(keyword)}\\b`;
  return new RegExp(pattern, 'i').test(haystack);
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

const getDirectPhoneFromJid = (value?: string | null) => {
  const jid = String(value || '').trim().toLowerCase();
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@c.us')) {
    return null;
  }

  return normalizePhone(jid.split('@')[0]);
};

const formatPhoneLabel = (value?: string | null) => {
  const phone = normalizePhone(value);
  return phone ? `+${phone}` : null;
};

const toTitleCase = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase());

const humanizeSessionLabel = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return 'Workspace lane';
  }

  const phone = formatPhoneLabel(raw);
  if (phone) {
    return phone;
  }

  return toTitleCase(raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim());
};

const isLikelyJid = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('@') || normalized.endsWith('.us');
};

const getSessionDisplayLabel = (session?: InboxSessionSummary | null) => {
  if (!session) {
    return 'Workspace inbox';
  }

  const owner = String(session.ownerName || '').trim();
  const phone = formatPhoneLabel(session.phoneNumber);
  if (owner && phone) {
    return `${owner} · ${phone}`;
  }
  if (owner) {
    return owner;
  }
  if (phone) {
    return phone;
  }

  return humanizeSessionLabel(session.label);
};

const buildWaLink = (phone: string, title: string) => {
  const text = `Hi ${title}, reaching out on your real estate message.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
};

const buildCallLink = (phone: string) => `tel:+${phone}`;

const formatRoleLabel = (role: InboxThreadIntel['contact']['role']) => {
  if (role === 'unknown') {
    return 'Unknown';
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const isEmojiHeavy = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  const emojiMatches = text.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];
  const alphaNumeric = text.replace(/[^a-z0-9]/gi, '');
  return emojiMatches.length >= 2 && alphaNumeric.length <= Math.max(4, Math.floor(text.length * 0.25));
};

const inferThreadSignal = (chat: InboxChat): ThreadSignal => {
  const haystack = `${chat.title} ${chat.preview}`.toLowerCase();
  const hasBlockedLink = BLOCKED_LINK_PATTERNS.some((pattern) => haystack.includes(pattern));
  const hasLowSignalPhrase = LOW_SIGNAL_PATTERNS.some((pattern) => haystack.includes(pattern));
  const hasRealEstateKeyword = REAL_ESTATE_KEYWORDS.some((pattern) => hasKeywordMatch(haystack, pattern))
    || /\b\d+\s*bhk\b/.test(haystack)
    || /\b\d+(\.\d+)?\s*(cr|crore|lac|lakh)\b/.test(haystack);

  if (hasBlockedLink && !hasRealEstateKeyword) {
    return {
      suggestedState: 'held',
      reason: 'AI held this thread because the latest message looks like a social link, not a real-estate lead for your inbox.',
      confidence: 'high',
    };
  }

  if ((hasLowSignalPhrase || isEmojiHeavy(chat.preview)) && !hasRealEstateKeyword) {
    return {
      suggestedState: 'held',
      reason: 'AI held this thread because it looks like low-signal chatter instead of business context for the inbox.',
      confidence: 'medium',
    };
  }

  if (!hasRealEstateKeyword) {
    return {
      suggestedState: 'held',
      reason: 'AI held this thread until it sees a real-estate signal or you explicitly allow it into the inbox.',
      confidence: 'medium',
    };
  }

  return {
    suggestedState: 'allowed',
    reason: 'AI marked this thread as real-estate relevant and safe to keep in your private inbox.',
    confidence: 'high',
  };
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

  const phone = getDirectPhoneFromJid(row.remote_jid);
  return phone ? `+${phone}` : 'Direct contact';
};

const getChatDisplayTitle = (chat?: InboxChat | null) => {
  if (!chat) {
    return 'Direct contact';
  }

  const normalizedTitle = String(chat.title || '').trim();
  if (normalizedTitle && !isLikelyJid(normalizedTitle)) {
    return normalizedTitle;
  }

  return formatPhoneLabel(getDirectPhoneFromJid(chat.remoteJid))
    || formatPhoneLabel(chat.intel?.contact.phone)
    || normalizedTitle
    || 'Direct contact';
};

const getChatSubtitle = (chat?: InboxChat | null) => {
  if (!chat) {
    return '';
  }

  return [
    formatPhoneLabel(chat.intel?.contact.phone) || formatPhoneLabel(getDirectPhoneFromJid(chat.remoteJid)),
    `last activity ${formatTime(chat.lastMessageAt)}`,
  ].filter(Boolean).join(' · ');
};

const formatSenderLabel = (sender?: string | null, chat?: InboxChat | null) => {
  if (isOutboundSender(sender)) {
    return 'You';
  }

  const normalized = String(sender || '').trim();
  if (!normalized) {
    return getChatDisplayTitle(chat);
  }

  if (!isLikelyJid(normalized)) {
    return normalized;
  }

  return formatPhoneLabel(normalized.split('@')[0]) || getChatDisplayTitle(chat);
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
      type: 'direct' as const,
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
  sessions: Array.isArray(data?.sessions) ? data.sessions : [],
  chats: Array.isArray(data?.chats) ? data.chats : [],
  messages: Array.isArray(data?.messages) ? data.messages : [],
});

const sanitizeInboxError = (message: string) => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('whatsapp_groups') ||
    normalized.includes('schema cache') ||
    normalized.includes('created_at does not exist') ||
    normalized.includes('message_text does not exist')
  ) {
    return 'this workspace is still on an older database shape, so Inbox is falling back to the direct-message log without the richer thread metadata';
  }

  return message;
};

export const Inbox: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = React.useState<InboxResponse | null>(null);
  const [threadMessages, setThreadMessages] = React.useState<Record<string, InboxMessage[]>>({});
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
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);
  const [isSavingGovernance, setIsSavingGovernance] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [listMode, setListMode] = React.useState<ThreadGovernanceState>('allowed');

  const selectSessionLabel = React.useCallback((nextLabel: string | null) => {
    setSelectedSessionLabel(nextLabel);
    try {
      if (nextLabel) {
        window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, nextLabel);
      } else {
        window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures.
    }

    window.dispatchEvent(new CustomEvent('whatsapp:selected-session', {
      detail: { label: nextLabel },
    }));
  }, []);

  const loadInbox = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.inbox, {
        params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
      });
      const payload = unwrapInboxPayload(response.data);
      setData(payload);
      setThreadMessages({});
      setSelectedChatId((current) => current || payload.chats?.[0]?.id || '');
      setIsLoading(false);
      return;
    } catch (err: any) {
      const primaryError = handleApiError(err);

      try {
        const fallback = await backendApi.get(ENDPOINTS.whatsapp.messages);
        const payload = fallbackInboxFromMessages(Array.isArray(fallback.data) ? fallback.data : []);
        setData(payload);
        setThreadMessages(
          payload.messages.reduce<Record<string, InboxMessage[]>>((acc, message) => {
            acc[message.chatId] = acc[message.chatId] || [];
            acc[message.chatId].push(message);
            return acc;
          }, {}),
        );
        setSelectedChatId((current) => current || payload.chats?.[0]?.id || '');
        setError(
          err?.response?.status === 404
            ? 'Inbox endpoint is not live on this API build yet, so this view is using the saved direct-message log for now.'
            : `Inbox history is unavailable right now, so this view is using the saved direct-message log instead. (${sanitizeInboxError(primaryError)})`,
        );
      } catch (fallbackErr) {
        setError(handleApiError(fallbackErr));
        setData(null);
      } finally {
        setIsLoading(false);
      }
    }
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

  const threadSignals = React.useMemo(
    () => chats.reduce<Record<string, ThreadSignal>>((acc, chat) => {
      acc[chat.id] = chat.governance
        ? {
            suggestedState: chat.governance.state,
            reason: chat.governance.reason,
            confidence: chat.governance.confidence,
          }
        : inferThreadSignal(chat);
      return acc;
    }, {}),
    [chats],
  );

  const effectiveThreadState = React.useCallback((chat: InboxChat) => {
    return chat.governance?.state || threadSignals[chat.id]?.suggestedState || 'allowed';
  }, [threadSignals]);

  const visibleChats = React.useMemo(
    () => chats.filter((chat) => effectiveThreadState(chat) === listMode),
    [chats, effectiveThreadState, listMode],
  );

  const chatCounts = React.useMemo(
    () => chats.reduce(
      (acc, chat) => {
        const state = effectiveThreadState(chat);
        acc[state] += 1;
        return acc;
      },
      { allowed: 0, held: 0, ignored: 0 } as Record<ThreadGovernanceState, number>,
    ),
    [chats, effectiveThreadState],
  );

  const threadsNeedingResponse = React.useMemo(
    () => visibleChats.filter((chat) => !String(chat.preview || '').trim().toLowerCase().startsWith('you:')),
    [visibleChats],
  );

  const selectedChat = visibleChats.find((chat) => chat.id === selectedChatId) || visibleChats[0] || null;
  const selectedSignal = selectedChat ? threadSignals[selectedChat.id] || inferThreadSignal(selectedChat) : null;
  const selectedIntel = selectedChat?.intel || null;
  const selectedPhone = getDirectPhoneFromJid(selectedChat?.remoteJid);
  const connectedSessions = React.useMemo(
    () => (data?.sessions || []).filter((session) => session.status === 'connected'),
    [data?.sessions],
  );
  const selectedSession = React.useMemo(
    () => connectedSessions.find((session) => session.label === selectedSessionLabel)
      || (data?.sessions || []).find((session) => session.label === selectedSessionLabel)
      || connectedSessions[0]
      || null,
    [connectedSessions, data?.sessions, selectedSessionLabel],
  );
  const selectedSessionChip = getSessionDisplayLabel(selectedSession);
  const inboxLaneSummary = connectedSessions.length > 1
    ? `${connectedSessions.length} connected numbers`
    : connectedSessions.length === 1
      ? '1 connected number'
      : 'Workspace inbox';
  const selectedChatTitle = getChatDisplayTitle(selectedChat);
  const selectedChatSubtitle = getChatSubtitle(selectedChat);

  React.useEffect(() => {
    if (selectedChatId && visibleChats.some((chat) => chat.id === selectedChatId)) {
      return;
    }
    setSelectedChatId(visibleChats[0]?.id || '');
  }, [selectedChatId, visibleChats]);

  React.useEffect(() => {
    setDraft('');
  }, [selectedChat?.id]);

  const messages = React.useMemo(() => {
    if (!selectedChat?.id) {
      return [];
    }

    if (threadMessages[selectedChat.id]) {
      return threadMessages[selectedChat.id];
    }

    return (data?.messages || []).filter((message) => message.chatId === selectedChat.id);
  }, [data?.messages, selectedChat?.id, threadMessages]);

  const setChatGovernance = React.useCallback(async (chatId: string, state: ThreadGovernanceState) => {
    if (isSavingGovernance) {
      return;
    }

    const reason =
      state === 'allowed'
        ? 'Broker kept this thread in the inbox.'
        : state === 'held'
          ? 'Broker held this thread outside the inbox.'
          : 'Broker ignored this thread from the inbox.';

    const previousData = data;
    setIsSavingGovernance(true);
    setData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        chats: current.chats.map((chat) => (
          chat.id === chatId
            ? {
                ...chat,
                governance: {
                  state,
                  reason,
                  confidence: chat.governance?.confidence || 'high',
                  override: true,
                },
              }
            : chat
        )),
      };
    });

    try {
      await backendApi.post(ENDPOINTS.whatsapp.inboxGovernance, {
        chatId,
        state,
        reason,
        sessionLabel: selectedSessionLabel || undefined,
      });
    } catch (err) {
      setData(previousData);
      setError(handleApiError(err));
    } finally {
      setIsSavingGovernance(false);
    }
  }, [data, isSavingGovernance, selectedSessionLabel]);

  const handleSend = React.useCallback(async () => {
    if (!selectedChat || isSending) {
      return;
    }

    const text = draft.trim();
    if (!text) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await backendApi.post(ENDPOINTS.whatsapp.send, {
        remoteJid: selectedChat.remoteJid,
        text,
        sessionKey: selectedSessionLabel || undefined,
      });

      const optimisticMessage: InboxMessage = {
        id: `local-${selectedChat.id}-${Date.now()}`,
        chatId: selectedChat.id,
        text,
        sender: 'Broker',
        direction: 'outbound',
        timestamp: new Date().toISOString(),
      };

      setThreadMessages((current) => ({
        ...current,
        [selectedChat.id]: [...(current[selectedChat.id] || messages), optimisticMessage],
      }));
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          summary: {
            ...current.summary,
            totalMessages: current.summary.totalMessages + 1,
          },
          chats: current.chats.map((chat) =>
            chat.id === selectedChat.id
              ? {
                  ...chat,
                  preview: `You: ${text}`,
                  lastMessageAt: optimisticMessage.timestamp,
                  messageCount: chat.messageCount + 1,
                }
              : chat,
          ),
        };
      });
      setDraft('');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, messages, selectedChat, selectedSessionLabel]);

  const renderThreadButton = (chat: InboxChat) => {
    const state = effectiveThreadState(chat);
    const displayTitle = getChatDisplayTitle(chat);
    const localityPreview = chat.intel?.contact.localities?.slice(0, 2) || [];
    const rolePreview = chat.intel?.contact.role && chat.intel.contact.role !== 'unknown'
      ? formatRoleLabel(chat.intel.contact.role)
      : null;
    return (
      <button
        key={chat.id}
        type="button"
        onClick={() => setSelectedChatId(chat.id)}
        className={cn(
          'flex w-full items-start gap-3 rounded-[16px] border px-3 py-3 text-left transition-colors',
          selectedChat?.id === chat.id
            ? 'border-[#4a99ff]/40 bg-[#182230] shadow-[0_12px_28px_rgba(0,0,0,0.18)]'
            : 'border-[rgba(148,163,184,0.08)] bg-[rgba(15,23,36,0.56)] hover:border-[rgba(148,163,184,0.18)] hover:bg-[rgba(20,31,48,0.92)]',
        )}
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(74,153,255,0.12)] text-[#7dd3fc]">
          <MessageSquareTextIcon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-medium text-white">{displayTitle}</p>
            <span className="shrink-0 text-[10px] text-slate-500">{formatTime(chat.lastMessageAt)}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] leading-5 text-slate-400">{chat.preview || 'No message text'}</p>
          {rolePreview || localityPreview.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rolePreview ? (
                <span className="rounded-full border border-[rgba(125,211,252,0.16)] bg-[rgba(125,211,252,0.08)] px-2 py-0.5 text-[10px] text-[#c7e7ff]">
                  {rolePreview}
                </span>
              ) : null}
              {localityPreview.map((locality) => (
                <span
                  key={locality}
                  className="rounded-full border border-emerald-500/14 bg-emerald-500/8 px-2 py-0.5 text-[10px] text-emerald-100"
                >
                  {locality}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
            <span>{chat.messageCount} msgs</span>
            {state === 'held' ? (
              <span className="rounded-full bg-amber-500/12 px-1.5 py-0.5 text-amber-200">AI held</span>
            ) : null}
            {state === 'ignored' ? (
              <span className="rounded-full bg-rose-500/12 px-1.5 py-0.5 text-rose-200">Ignored</span>
            ) : null}
            {!String(chat.preview || '').trim().toLowerCase().startsWith('you:') ? (
              <span className="rounded-full bg-[rgba(74,153,255,0.16)] px-1.5 py-0.5 text-[#7dd3fc]">Needs reply</span>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  React.useEffect(() => {
    if (!selectedChat?.id) {
      return;
    }

    if (threadMessages[selectedChat.id]) {
      return;
    }

    let cancelled = false;

    const loadThreadMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const response = await backendApi.get<InboxMessagesResponse>(ENDPOINTS.whatsapp.monitorMessages, {
          params: {
            chatId: selectedChat.id,
            sessionLabel: selectedSessionLabel || undefined,
            limit: 100,
          },
        });

        if (!cancelled) {
          const nextMessages = Array.isArray(response.data?.messages) ? response.data.messages : [];
          setThreadMessages((current) => ({
            ...current,
            [selectedChat.id]: nextMessages,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          const fallbackMessages = (data?.messages || []).filter((message) => message.chatId === selectedChat.id);
          setThreadMessages((current) => ({
            ...current,
            [selectedChat.id]: fallbackMessages,
          }));
          setError((current) => current || handleApiError(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMessages(false);
        }
      }
    };

    void loadThreadMessages();

    return () => {
      cancelled = true;
    };
  }, [data?.messages, selectedChat?.id, selectedSessionLabel, threadMessages]);

  return (
    <div className="h-[calc(100vh-10rem)] overflow-hidden rounded-[24px] border border-[rgba(148,163,184,0.14)] bg-[radial-gradient(circle_at_top_left,rgba(74,153,255,0.08),transparent_30%),#0b0f17] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="hidden h-full min-h-0 flex-col border-r border-[rgba(148,163,184,0.12)] bg-[#111723] lg:flex">
          <div className="border-b border-[rgba(148,163,184,0.12)] px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7dd3fc]">Inbox</p>
                <p className="mt-1 text-lg font-semibold text-white">{selectedSessionChip}</p>
                <p className="mt-1 text-[11px] text-slate-500">{inboxLaneSummary}</p>
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
            {connectedSessions.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {connectedSessions.slice(0, 5).map((session) => (
                  <button
                    key={session.label}
                    type="button"
                    onClick={() => selectSessionLabel(session.label)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors',
                      selectedSessionLabel === session.label
                        ? 'border-[#7dd3fc]/40 bg-[#112031] text-white'
                        : 'border-[rgba(148,163,184,0.12)] bg-[#0d1420] text-slate-400 hover:border-[rgba(148,163,184,0.22)] hover:text-slate-200',
                    )}
                  >
                    {getSessionDisplayLabel(session)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="border-b border-[rgba(148,163,184,0.12)] px-4 py-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search threads"
                className="w-full rounded-xl border border-[rgba(148,163,184,0.12)] bg-[#0d1420] py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#7dd3fc]"
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
              <span>{visibleChats.length} threads</span>
              <span className="text-slate-600">/</span>
              <span>{threadsNeedingResponse.length} need reply</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { key: 'allowed', label: 'Inbox', count: chatCounts.allowed },
                { key: 'held', label: 'Held by AI', count: chatCounts.held },
                { key: 'ignored', label: 'Ignored', count: chatCounts.ignored },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setListMode(item.key as ThreadGovernanceState)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    listMode === item.key
                      ? 'border-[#7dd3fc]/40 bg-[#112031] text-white'
                      : 'border-[rgba(148,163,184,0.12)] bg-[#0d1420] text-slate-400 hover:border-[rgba(148,163,184,0.22)] hover:text-slate-200',
                  )}
                >
                  {item.label} · {item.count}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className={cn(
              'mx-4 mt-3 rounded-xl px-3 py-3 text-xs leading-5',
              error.includes('not live')
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                : 'border border-amber-500/20 bg-amber-500/10 text-amber-100',
            )}>
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!isLoading && visibleChats.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-500">
                {listMode === 'allowed'
                  ? 'No direct-message threads are cleared for the inbox yet.'
                  : listMode === 'held'
                    ? 'AI is not holding any threads right now.'
                    : 'No threads are currently ignored.'}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleChats.map(renderThreadButton)}
              </div>
            )}
          </div>
        </aside>

        <section className="flex h-full min-h-0 min-w-0 flex-col bg-[linear-gradient(180deg,#0b0f17_0%,#0c1119_100%)]">
          <div className="border-b border-[rgba(148,163,184,0.12)] px-5 py-4">
            {selectedChat ? (
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7dd3fc]">Private thread workspace</p>
                  <p className="mt-2 truncate text-xl font-semibold text-white">{selectedChatTitle}</p>
                  <p className="mt-0.5 truncate text-[12px] text-slate-400">
                    {selectedChatSubtitle}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/18 bg-emerald-500/8 px-3 py-1 text-[11px] text-emerald-100">
                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                    Private to your workspace. Not shown in public stream.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void setChatGovernance(selectedChat.id, 'allowed')}
                    className="inline-flex items-center gap-2 rounded-lg border border-[rgba(74,153,255,0.25)] bg-[rgba(74,153,255,0.12)] px-3 py-1.5 text-[11px] font-medium text-[#c7e7ff] hover:border-[#7dd3fc]"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Keep in inbox
                  </button>
                  <button
                    type="button"
                    onClick={() => void setChatGovernance(selectedChat.id, 'held')}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-100 hover:border-amber-400/40"
                  >
                    Hold outside inbox
                  </button>
                  <button
                    type="button"
                    onClick={() => void setChatGovernance(selectedChat.id, 'ignored')}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-medium text-rose-100 hover:border-rose-400/40"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    Never show in inbox
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/agent')}
                    className="rounded-lg border border-[rgba(148,163,184,0.14)] bg-[#111723] px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-[#7dd3fc]"
                  >
                    Open Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/stream')}
                    className="rounded-lg border border-[rgba(148,163,184,0.14)] bg-[#111723] px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-[#7dd3fc]"
                  >
                    Open Stream
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-white">Choose a thread</p>
            )}
          </div>

          <div className="border-b border-[rgba(148,163,184,0.12)] px-4 py-3 lg:hidden">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search threads"
                className="w-full rounded-xl border border-[rgba(148,163,184,0.12)] bg-[#111723] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#7dd3fc]"
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {visibleChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => setSelectedChatId(chat.id)}
                  className={cn(
                    'shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-medium',
                    selectedChat?.id === chat.id
                      ? 'border-[#7dd3fc]/40 bg-[#112031] text-white'
                      : 'border-[rgba(148,163,184,0.12)] bg-[rgba(15,23,36,0.8)] text-slate-400',
                  )}
                >
                  {getChatDisplayTitle(chat)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-transparent px-4 py-4 sm:px-6">
            {selectedChat ? (
              <div className="mx-auto grid w-full max-w-[1400px] gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-[20px] border border-[rgba(148,163,184,0.12)] bg-[#111723] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7dd3fc]">AI source control</p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {selectedSignal?.reason || 'AI is evaluating this thread for business relevance.'}
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-slate-400">
                          Social links, emoji-heavy chatter, and non-real-estate DMs are held out by default unless you explicitly allow them.
                        </p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                        effectiveThreadState(selectedChat) === 'allowed'
                          ? 'bg-emerald-500/12 text-emerald-100'
                          : effectiveThreadState(selectedChat) === 'held'
                            ? 'bg-amber-500/12 text-amber-100'
                            : 'bg-rose-500/12 text-rose-100',
                      )}>
                        {effectiveThreadState(selectedChat)}
                      </span>
                    </div>
                  </div>

                  {selectedIntel ? (
                    <div className="rounded-[20px] border border-[rgba(148,163,184,0.12)] bg-[#111723] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7dd3fc]">Stored thread memory</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-white">
                        {selectedIntel.summary}
                      </p>

                      <div className="mt-4 grid gap-3">
                        {(selectedPhone || selectedIntel.contact.phone) ? (
                          <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Personal outreach</p>
                            <p className="mt-2 text-sm font-medium text-white">
                              {formatPhoneLabel(selectedIntel.contact.phone) || formatPhoneLabel(selectedPhone) || 'Direct contact'}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              Reach out from your own phone here when this private inbox thread should turn into a real conversation.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {selectedPhone ? (
                                <a
                                  href={buildCallLink(selectedPhone)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-100 hover:border-emerald-400/40"
                                >
                                  <CallbackIcon className="h-3.5 w-3.5" />
                                  Call
                                </a>
                              ) : null}
                              {selectedPhone ? (
                                <a
                                  href={buildWaLink(selectedPhone, selectedChatTitle)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-[rgba(148,163,184,0.14)] bg-[#111723] px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-[#7dd3fc]"
                                >
                                  Open WhatsApp
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Contact role</p>
                          <p className="mt-2 text-sm font-medium text-white">{formatRoleLabel(selectedIntel.contact.role)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">Confidence {selectedIntel.contact.confidence}</p>
                        </div>
                        <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Message balance</p>
                          <p className="mt-2 text-sm font-medium text-white">{selectedIntel.thread.inboundCount} inbound · {selectedIntel.thread.outboundCount} outbound</p>
                          <p className="mt-1 text-[11px] text-slate-500">Last inbound {formatTime(selectedIntel.thread.lastInboundAt)}</p>
                        </div>
                        <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Budgets recalled</p>
                          <p className="mt-2 text-sm font-medium text-white">{selectedIntel.contact.budgets.length > 0 ? selectedIntel.contact.budgets.join(', ') : 'Not detected yet'}</p>
                        </div>
                        <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Property focus</p>
                          <p className="mt-2 text-sm font-medium text-white">{selectedIntel.contact.propertyTypes.length > 0 ? selectedIntel.contact.propertyTypes.join(', ') : 'Not detected yet'}</p>
                        </div>
                        <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Localities recalled</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedIntel.contact.localities.length > 0 ? selectedIntel.contact.localities.map((locality) => (
                              <span key={locality} className="rounded-full border border-[rgba(125,211,252,0.18)] bg-[rgba(125,211,252,0.08)] px-2.5 py-1 text-[11px] text-[#c7e7ff]">
                                {locality}
                              </span>
                            )) : (
                              <span className="text-[12px] text-slate-500">No stable locality signal yet.</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Requirement signals</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedIntel.thread.requirementSignals.length > 0 ? selectedIntel.thread.requirementSignals.map((signal) => (
                              <span key={signal} className="rounded-full border border-emerald-500/18 bg-emerald-500/8 px-2.5 py-1 text-[11px] text-emerald-100">
                                {signal}
                              </span>
                            )) : (
                              <span className="text-[12px] text-slate-500">Waiting for clearer requirement cues.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[20px] border border-[rgba(148,163,184,0.12)] bg-[#101722]">
                  <div className="border-b border-[rgba(148,163,184,0.12)] px-5 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7dd3fc]">Conversation timeline</p>
                    <p className="mt-1 text-[12px] text-slate-400">Private message history for this thread.</p>
                  </div>
                  <div className="flex max-h-[calc(100vh-22rem)] min-h-[520px] flex-col overflow-y-auto px-4 py-4 sm:px-5">
                    {isLoadingMessages && messages.length === 0 ? (
                      <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] px-4 py-3 text-sm text-slate-400">
                        Loading thread history...
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            'max-w-[78%] rounded-2xl border px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.12)]',
                            message.direction === 'outbound'
                              ? 'ml-auto border-emerald-500/20 bg-emerald-500/10 text-white'
                              : 'border-[rgba(148,163,184,0.1)] bg-[#151c28] text-slate-100',
                          )}
                        >
                          {message.direction === 'inbound' && message.sender ? (
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7dd3fc]">{formatSenderLabel(message.sender, selectedChat)}</p>
                          ) : null}
                          <p className="whitespace-pre-wrap text-[13px] leading-6">{message.text || 'No message text'}</p>
                          <div className="mt-2 flex justify-end text-[10px] text-slate-500">
                            {formatTime(message.timestamp)}
                          </div>
                        </div>
                      ))}
                    </div>
                    {!isLoadingMessages && messages.length === 0 ? (
                      <div className="rounded-xl border border-[rgba(148,163,184,0.1)] bg-[#151c28] px-4 py-3 text-sm text-slate-400">
                        No message history is available for this thread yet.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(148,163,184,0.08)] text-slate-500">
                    <MessageSquareTextIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">Thread workspace</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Pick a thread on the left to review its private message history, AI relevance decision, and next actions.
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedChat ? (
            <div className="shrink-0 border-t border-[rgba(148,163,184,0.12)] bg-[#111723] px-4 py-3 sm:px-6">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-[rgba(148,163,184,0.12)] bg-[#0d1420] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Reply from PropAI</p>
                    <p className="text-sm leading-6 text-slate-200">
                      Send directly from the selected workspace lane, or use call and WhatsApp above when you want personal outreach from your own phone.
                    </p>
                  </div>
                  {selectedPhone ? (
                    <div className="text-[11px] text-slate-500">Contact {selectedChatTitle}</div>
                  ) : null}
                </div>
                <div className="flex w-full items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={1}
                    placeholder={`Reply to ${selectedChatTitle}`}
                    className="min-h-[52px] flex-1 resize-none rounded-2xl border border-[rgba(148,163,184,0.14)] bg-[#111723] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#7dd3fc]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={isSending || !draft.trim()}
                    className="rounded-2xl bg-[#2f7df6] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};
