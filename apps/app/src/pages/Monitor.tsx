import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { createSupabaseBrowserClient } from '../services/supabaseBrowser';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import {
  ActivityIcon,
  GroupsIcon,
  LoaderIcon,
  MessageSquareIcon,
  PowerIcon,
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
  isParsing?: boolean;
  messageCount: number;
};

type MonitorMessage = {
  id: string;
  chatId: string;
  remoteJid?: string;
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
  messages?: MonitorMessage[];
};

type MonitorThreadResponse = {
  chatId: string;
  messages: MonitorMessage[];
  pagination?: {
    limit: number;
    hasMore: boolean;
    nextBefore: string | null;
  };
};

type MonitorGroupDirectoryItem = {
  id: string;
  groupJid?: string;
  name?: string;
  locality?: string | null;
  city?: string | null;
  category?: string | null;
  tags?: string[];
  participantsCount?: number;
  broadcastEnabled?: boolean;
  isParsing?: boolean;
  classification?: 'business' | 'personal' | 'unknown' | string;
  visibilityStatus?: 'visible' | 'hidden' | string;
  businessConfidence?: number;
  lastActiveAt?: string | null;
  sessionLabel?: string | null;
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

const THREAD_PAGE_SIZE = 100;
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';

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
  const digits = String(value || '').split('').filter((c) => c >= '0' && c <= '9').join('');
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

  for (const row of rows) {
    const remoteJid = String(row.remote_jid || '');
    if (!remoteJid) continue;

    const isGroup = remoteJid.endsWith('@g.us');
    const timestamp = row.timestamp || row.created_at || new Date().toISOString();
    const text = String(row.message_text || row.text || '').trim();
    const title = isGroup
      ? String(row.sender || '').trim() || 'WhatsApp group'
      : buildDirectTitle(row);

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
  }

  const chats = Array.from(chatsMap.values()).sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );

  return {
    summary: {
      totalChats: chats.length,
      directChats: chats.filter((chat) => chat.type === 'direct').length,
      groupChats: chats.filter((chat) => chat.type === 'group').length,
      totalMessages: rows.length,
      connectedSessions: 0,
    },
    sessions: [],
    chats,
    messages: [],
  };
};

const fallbackThreadFromMessages = (
  rows: RawMessageRow[],
  chatId: string,
  before?: string | null,
): MonitorThreadResponse => {
  const filtered = rows
    .filter((row) => String(row.remote_jid || '') === chatId)
    .sort((left, right) => new Date(right.timestamp || right.created_at || 0).getTime() - new Date(left.timestamp || left.created_at || 0).getTime());

  const beforeTime = before ? new Date(before).getTime() : null;
  const scoped = beforeTime
    ? filtered.filter((row) => new Date(row.timestamp || row.created_at || 0).getTime() < beforeTime)
    : filtered;
  const slice = scoped.slice(0, THREAD_PAGE_SIZE + 1);
  const hasMore = slice.length > THREAD_PAGE_SIZE;
  const pageRows = hasMore ? slice.slice(0, THREAD_PAGE_SIZE) : slice;
  const messages = pageRows
    .slice()
    .reverse()
    .map((row) => {
      const isGroup = String(row.remote_jid || '').endsWith('@g.us');
      const timestamp = row.timestamp || row.created_at || new Date().toISOString();
      return {
        id: String(row.id || `${chatId}-${timestamp}`),
        chatId,
        remoteJid: chatId,
        type: isGroup ? 'group' as const : 'direct' as const,
        title: isGroup ? 'WhatsApp group' : buildDirectTitle(row),
        text: String(row.message_text || row.text || '').trim(),
        sender: row.sender || null,
        direction: isOutboundSender(row.sender) ? 'outbound' as const : 'inbound' as const,
        timestamp,
      };
    });

  return {
    chatId,
    messages,
    pagination: {
      limit: THREAD_PAGE_SIZE,
      hasMore,
      nextBefore: pageRows[pageRows.length - 1]?.timestamp || pageRows[pageRows.length - 1]?.created_at || null,
    },
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

const unwrapMonitorThreadPayload = (data: any): MonitorThreadResponse => ({
  chatId: String(data?.chatId || ''),
  messages: Array.isArray(data?.messages) ? data.messages : [],
  pagination: {
    limit: Number(data?.pagination?.limit || THREAD_PAGE_SIZE),
    hasMore: Boolean(data?.pagination?.hasMore),
    nextBefore: data?.pagination?.nextBefore || null,
  },
});

const sanitizeMonitorError = (message: string) => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('whatsapp_groups') ||
    normalized.includes('schema cache') ||
    normalized.includes('created_at does not exist') ||
    normalized.includes('message_text does not exist')
  ) {
    return 'this workspace is still on an older database shape, so some monitor metadata is temporarily limited';
  }

  return message;
};

const mergeMonitorChatsWithGroups = (
  monitor: MonitorResponse,
  groups: MonitorGroupDirectoryItem[],
): MonitorResponse => {
  if (!Array.isArray(groups) || groups.length === 0) {
    return monitor;
  }

  const chatsMap = new Map<string, MonitorChat>();
  for (const chat of monitor.chats || []) {
    chatsMap.set(chat.id, chat);
  }

  for (const group of groups) {
    if (String(group.visibilityStatus || 'visible') !== 'visible') {
      continue;
    }
    const groupJid = String(group.groupJid || group.id || '').trim();
    if (!groupJid) continue;

    const existing = chatsMap.get(groupJid);
    if (existing) {
      chatsMap.set(groupJid, {
        ...existing,
        title: group.name || existing.title,
        locality: group.locality ?? existing.locality,
        city: group.city ?? existing.city,
        category: group.category ?? existing.category,
        tags: Array.isArray(group.tags) && group.tags.length > 0 ? group.tags : existing.tags,
        participantsCount: typeof group.participantsCount === 'number' ? group.participantsCount : existing.participantsCount,
        broadcastEnabled: typeof group.broadcastEnabled === 'boolean' ? group.broadcastEnabled : existing.broadcastEnabled,
        isParsing: typeof group.isParsing === 'boolean' ? group.isParsing : existing.isParsing,
        lastMessageAt: existing.lastMessageAt || group.lastActiveAt || new Date(0).toISOString(),
      });
      continue;
    }

    chatsMap.set(groupJid, {
      id: groupJid,
      remoteJid: groupJid,
      type: 'group',
      title: group.name || 'WhatsApp group',
      preview: 'No mirrored messages yet',
      lastMessageAt: group.lastActiveAt || new Date(0).toISOString(),
      sender: null,
      locality: group.locality || null,
      city: group.city || null,
      category: group.category || null,
      tags: Array.isArray(group.tags) ? group.tags : [],
      participantsCount: Number(group.participantsCount || 0),
      broadcastEnabled: Boolean(group.broadcastEnabled),
      isParsing: typeof group.isParsing === 'boolean' ? group.isParsing : undefined,
      messageCount: 0,
    });
  }

  const chats = Array.from(chatsMap.values()).sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );

  return {
    ...monitor,
    summary: {
      ...monitor.summary,
      totalChats: chats.length,
      directChats: chats.filter((chat) => chat.type === 'direct').length,
      groupChats: chats.filter((chat) => chat.type === 'group').length,
    },
    chats,
  };
};

const mergeMessages = (existing: MonitorMessage[], incoming: MonitorMessage[]) => {
  const seen = new Map<string, MonitorMessage>();

  for (const message of [...existing, ...incoming]) {
    seen.set(message.id, message);
  }

  return Array.from(seen.values()).sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
};

const monitorPill =
  'inline-flex items-center gap-2 rounded-full border border-[#2b3b45] bg-[#111b21] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d1d7db]';
const monitorSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[#2b3b45] bg-[#111b21] px-3 py-2 text-[11px] font-semibold text-[#d1d7db] transition-all duration-150 hover:border-[#3f5968] hover:text-white';
const monitorPrimaryButton =
  'inline-flex items-center justify-center rounded-[14px] bg-[#00a884] px-4 text-[12px] font-bold uppercase tracking-[0.08em] text-[#0b141a] shadow-[0_10px_24px_rgba(0,168,132,0.2)] transition-all duration-150 hover:-translate-y-[1px] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';

export const Monitor: React.FC = () => {
  const [data, setData] = React.useState<MonitorResponse | null>(null);
  const [groupDirectory, setGroupDirectory] = React.useState<MonitorGroupDirectoryItem[]>([]);
  const [syncedGroupCount, setSyncedGroupCount] = React.useState(0);
  const [hiddenGroupCount, setHiddenGroupCount] = React.useState(0);
  const [selectedSessionLabel, setSelectedSessionLabel] = React.useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [selectedChatId, setSelectedChatId] = React.useState<string>('');
  const [search, setSearch] = React.useState('');
  const [chatFilter, setChatFilter] = React.useState<'all' | 'groups' | 'direct'>('all');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isThreadLoading, setIsThreadLoading] = React.useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [sendStatus, setSendStatus] = React.useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [clearedChatIds, setClearedChatIds] = React.useState<Set<string>>(new Set());
  const [threadMessages, setThreadMessages] = React.useState<MonitorMessage[]>([]);
  const [threadPagination, setThreadPagination] = React.useState<{ hasMore: boolean; nextBefore: string | null }>({
    hasMore: false,
    nextBefore: null,
  });

  const handleClearChat = React.useCallback((chatId: string) => {
    setClearedChatIds((prev) => {
      const next = new Set(prev);
      next.add(chatId);
      return next;
    });
    setToast('Chat cleared locally. Messages will reappear after the next sync.');
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadMonitor = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.monitor, {
        params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
      });
      const payload = mergeMonitorChatsWithGroups(unwrapMonitorPayload(response.data), groupDirectory);
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
            ? 'Monitor endpoint is not live on this API build yet, so this view is using the saved message log for now.'
            : `Monitor overview is unavailable right now, so this view is using the saved message log instead. (${sanitizeMonitorError(primaryError)})`,
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
  }, [groupDirectory, selectedSessionLabel]);

  const syncGroupDirectory = React.useCallback(async () => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.groups, {
        params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
      });
      const groups = Array.isArray(response.data) ? response.data as MonitorGroupDirectoryItem[] : [];
      setGroupDirectory(groups);
      setSyncedGroupCount(groups.length);
      setHiddenGroupCount(groups.filter((group) => String(group.visibilityStatus || 'visible') !== 'visible').length);
      setData((current) => {
        if (!current) {
          return current;
        }
        return mergeMonitorChatsWithGroups(current, groups);
      });
    } catch (err) {
      console.warn('[Monitor] Failed to sync group directory', handleApiError(err));
    }
  }, [selectedSessionLabel]);

  const loadThread = React.useCallback(async (
    chatId: string,
    options?: { before?: string | null; appendOlder?: boolean; preserveExisting?: boolean },
  ) => {
    if (!chatId) {
      setThreadMessages([]);
      setThreadPagination({ hasMore: false, nextBefore: null });
      return;
    }

    const before = options?.before || null;
    const appendOlder = Boolean(options?.appendOlder);
    const preserveExisting = Boolean(options?.preserveExisting);

    if (appendOlder) {
      setIsLoadingOlder(true);
    } else {
      setIsThreadLoading(true);
    }

    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.monitorMessages, {
        params: {
          chatId,
          limit: THREAD_PAGE_SIZE,
          ...(selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : {}),
          ...(before ? { before } : {}),
        },
      });
      const payload = unwrapMonitorThreadPayload(response.data);

      setThreadMessages((current) => {
        if (appendOlder || preserveExisting) {
          return mergeMessages(current, payload.messages);
        }
        return payload.messages;
      });
      setThreadPagination({
        hasMore: Boolean(payload.pagination?.hasMore),
        nextBefore: payload.pagination?.nextBefore || null,
      });
    } catch (err: any) {
      try {
        const fallback = await backendApi.get(ENDPOINTS.whatsapp.messages, {
          params: selectedSessionLabel ? { sessionLabel: selectedSessionLabel } : undefined,
        });
        const payload = fallbackThreadFromMessages(
          Array.isArray(fallback.data) ? fallback.data : [],
          chatId,
          before,
        );
        setThreadMessages((current) => {
          if (appendOlder || preserveExisting) {
            return mergeMessages(current, payload.messages);
          }
          return payload.messages;
        });
        setThreadPagination({
          hasMore: Boolean(payload.pagination?.hasMore),
          nextBefore: payload.pagination?.nextBefore || null,
        });
        if (!appendOlder) {
          setError((current) => current || `Monitor history fallback is active. (${sanitizeMonitorError(handleApiError(err))})`);
        }
      } catch (fallbackErr) {
        if (!appendOlder) {
          setThreadMessages([]);
          setThreadPagination({ hasMore: false, nextBefore: null });
          setError(handleApiError(fallbackErr));
        }
      }
    } finally {
      setIsThreadLoading(false);
      setIsLoadingOlder(false);
    }
  }, [selectedSessionLabel]);

  React.useEffect(() => {
    void loadMonitor();
    void syncGroupDirectory();
    const interval = setInterval(() => {
      void loadMonitor();
      if (selectedChatId) {
        void loadThread(selectedChatId, { preserveExisting: true });
      }
    }, 4000);

    const groupDirectoryInterval = setInterval(() => {
      void syncGroupDirectory();
    }, 60000);

    let supabaseCleanup: (() => void) | undefined;

    const setupRealtime = async () => {
      try {
        const client = createSupabaseBrowserClient();
        const channel = client
          .channel('monitor:messages')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
            },
            () => {
              void loadMonitor();
              if (selectedChatId) {
                void loadThread(selectedChatId, { preserveExisting: true });
              }
            },
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
              console.warn('[Monitor] Realtime subscription error, falling back to polling only');
            }
          });

        supabaseCleanup = () => {
          void client.removeChannel(channel);
        };
      } catch {
        // Realtime setup failure is non-fatal; polling continues
      }
    };

    void setupRealtime();

    return () => {
      clearInterval(interval);
      clearInterval(groupDirectoryInterval);
      supabaseCleanup?.();
    };
  }, [loadMonitor, loadThread, selectedChatId, syncGroupDirectory]);

  React.useEffect(() => {
    const handleSelectedSession = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string | null }>).detail;
      setSelectedSessionLabel(detail?.label || null);
      setThreadMessages([]);
      setThreadPagination({ hasMore: false, nextBefore: null });
    };

    window.addEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    return () => {
      window.removeEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    };
  }, []);

  const chats = React.useMemo(() => {
    const source = data?.chats || [];

    let filtered = source;
    if (chatFilter === 'groups') {
      filtered = source.filter((c) => c.type === 'group');
    } else if (chatFilter === 'direct') {
      filtered = source.filter((c) => c.type === 'direct');
    }

    const normalized = search.trim().toLowerCase();
    if (normalized) {
      filtered = filtered.filter((chat) => {
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
    }

    return filtered;
  }, [data?.chats, search, chatFilter]);

  const groupDirectoryByJid = React.useMemo(() => {
    return new Map(
      groupDirectory
        .map((group) => [String(group.groupJid || group.id || '').trim(), group] as const)
        .filter(([jid]) => Boolean(jid)),
    );
  }, [groupDirectory]);

  const displayChats = React.useMemo(() => {
    return chats.map((chat) => {
      if (chat.type !== 'group') {
        return chat;
      }

      const groupMeta = groupDirectoryByJid.get(chat.remoteJid);
      if (!groupMeta) {
        return chat;
      }

      return {
        ...chat,
        title: groupMeta.name || chat.title,
        locality: groupMeta.locality ?? chat.locality,
        city: groupMeta.city ?? chat.city,
        category: groupMeta.category ?? chat.category,
        tags: Array.isArray(groupMeta.tags) && groupMeta.tags.length > 0 ? groupMeta.tags : chat.tags,
        participantsCount: typeof groupMeta.participantsCount === 'number' ? groupMeta.participantsCount : chat.participantsCount,
        broadcastEnabled: typeof groupMeta.broadcastEnabled === 'boolean' ? groupMeta.broadcastEnabled : chat.broadcastEnabled,
        isParsing: typeof groupMeta.isParsing === 'boolean' ? groupMeta.isParsing : chat.isParsing,
      };
    });
  }, [chats, groupDirectoryByJid]);

  React.useEffect(() => {
    if (displayChats.length === 0) {
      setSelectedChatId('');
      return;
    }

    setSelectedChatId((current) => (
      current && displayChats.some((chat) => chat.id === current)
        ? current
        : displayChats[0]?.id || ''
    ));
  }, [displayChats]);

  React.useEffect(() => {
    if (!selectedChatId) {
      setThreadMessages([]);
      setThreadPagination({ hasMore: false, nextBefore: null });
      return;
    }

    void loadThread(selectedChatId);
  }, [selectedChatId, loadThread]);

  const selectedChat = displayChats.find((chat) => chat.id === selectedChatId) || displayChats[0] || null;
  const visibleMessages = React.useMemo(
    () => threadMessages.filter((message) => message.chatId === selectedChat?.id && !clearedChatIds.has(message.chatId)),
    [threadMessages, selectedChat?.id, clearedChatIds],
  );

  React.useEffect(() => {
    setReplyText('');
  }, [selectedChat?.id]);

  const handleLoadOlder = React.useCallback(async () => {
    if (!selectedChat?.id || !threadPagination.nextBefore || isLoadingOlder) {
      return;
    }

    await loadThread(selectedChat.id, {
      before: threadPagination.nextBefore,
      appendOlder: true,
    });
  }, [isLoadingOlder, loadThread, selectedChat?.id, threadPagination.nextBefore]);

  const handleSendReply = async () => {
    const text = replyText.trim();
    if (!selectedChat?.remoteJid || !text || isSending) {
      return;
    }

    setIsSending(true);
    setSendStatus('sending');
    setError(null);

    const jid = selectedChat.remoteJid;
    const isGroup = selectedChat.type === 'group';
    const targetLabel = isGroup ? `${selectedChat.title} group` : selectedChat.title;

    const optimisticMessage: MonitorMessage = {
      id: `optimistic-${Date.now()}`,
      chatId: jid,
      remoteJid: jid,
      type: selectedChat.type,
      title: selectedChat.title,
      text,
      sender: 'You',
      direction: 'outbound',
      timestamp: new Date().toISOString(),
    };

    setThreadMessages((current) => mergeMessages(current, [optimisticMessage]));
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        chats: current.chats.map((chat) =>
          chat.id === jid
            ? {
                ...chat,
                preview: text,
                lastMessageAt: optimisticMessage.timestamp,
                messageCount: chat.messageCount + 1,
              }
            : chat,
        ),
      };
    });
    setReplyText('');

    try {
      await backendApi.post(ENDPOINTS.whatsapp.send, {
        remoteJid: jid,
        text,
        sessionKey: selectedSessionLabel || undefined,
      });
      setSendStatus('sent');
      setToast(`Sent to ${targetLabel} \u2713`);
      setTimeout(() => { setSendStatus('idle'); setToast(null); }, 3000);
      await loadThread(jid, { preserveExisting: true });
      await loadMonitor();
    } catch (err) {
      setSendStatus('failed');
      setThreadMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      setError(handleApiError(err));
      setTimeout(() => { setSendStatus('idle'); setError(null); }, 4000);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="h-[calc(100svh-10rem)] min-h-0 overflow-hidden rounded-[30px] border border-[#202c33] bg-[#111b21] shadow-[0_28px_90px_rgba(0,0,0,0.38)] lg:h-[calc(100svh-9rem)]">
      <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="grid h-full min-h-0 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] border-r border-[#202c33] bg-[#111b21]">
          <div className="flex items-center justify-between border-b border-[#202c33] bg-[#202c33] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Monitor</p>
              <p className="text-[11px] text-[#8696a0]">
                <span className="relative mr-1.5 inline-block h-2 w-2 rounded-full bg-[#00a884] shadow-[0_0_6px_#00a884]" />
                Live workspace history · {data?.summary.totalChats || 0} chats · {data?.summary.groupChats || 0} visible groups · {syncedGroupCount || 0} synced groups
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadMonitor();
                void syncGroupDirectory();
                if (selectedChatId) {
                  void loadThread(selectedChatId, { preserveExisting: true });
                }
              }}
              className={monitorSecondaryButton}
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
                className="w-full rounded-[14px] border border-transparent bg-[#202c33] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-[#8696a0] focus:border-[#00a884]"
              />
            </div>
          </div>

          {displayChats.length > 0 ? (() => {
            const total = displayChats.length;
            const groupCount = displayChats.filter((c: MonitorChat) => c.type === 'group').length;
            const directCount = displayChats.filter((c: MonitorChat) => c.type === 'direct').length;
            const filters: { key: typeof chatFilter; label: string; count: number }[] = [
              { key: 'all', label: 'All', count: total },
              { key: 'groups', label: 'Groups', count: groupCount },
              { key: 'direct', label: 'Direct', count: directCount },
            ];
            return (
              <div className="flex gap-1 border-b border-[#202c33] bg-[#111b21] px-3 py-2">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setChatFilter(f.key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      chatFilter === f.key
                        ? 'bg-[#00a884] text-white'
                        : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942] hover:text-white',
                    )}
                  >
                    {f.label}
                    <span className={cn(
                      'ml-0.5 rounded-full px-1.5 text-[10px] tabular-nums',
                      chatFilter === f.key
                        ? 'bg-white/20 text-white'
                        : 'bg-[#111b21] text-[#8696a0]',
                    )}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
            );
          })() : null}

          {error ? (
            <div className={cn(
              'mx-3 mt-3 rounded-lg px-3 py-2 text-xs',
              error.includes('using the saved message log') || error.includes('fallback is active')
                ? 'bg-[#103529] text-[#d8fdd2]'
                : 'bg-[#32161a] text-[#ffd5d8]',
            )}>
              {error}
            </div>
          ) : null}

          {hiddenGroupCount > 0 ? (
            <div className="mx-3 mt-3 rounded-lg border border-[#1f4b3d] bg-[#0f2b23] px-3 py-2 text-xs text-[#d8fdd2]">
              Monitor is showing business groups only. {hiddenGroupCount} personal or low-confidence groups are hidden to keep the broker workspace clean. Nothing is deleted from WhatsApp.
            </div>
          ) : null}

          <div className="pulse-scrollbar min-h-0 overflow-y-auto">
            {displayChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedChatId(chat.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-[#202c33] px-4 py-3 text-left transition-colors hover:bg-[#202c33]',
                  selectedChat?.id === chat.id && 'bg-[#2a3942] shadow-[inset_3px_0_0_0_#00a884]',
                )}
              >
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#233138] text-[#d1d7db]">
                  {chat.type === 'group' ? <GroupsIcon className="h-5 w-5" /> : <SmartphoneIcon className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-[14px] font-medium text-white">{chat.title}</p>
                    <span className="shrink-0 pt-0.5 text-[11px] text-[#8696a0]">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[12px] text-[#8696a0]">
                    {chat.sender ? `${chat.sender}: ` : ''}
                    {chat.preview || 'No message text'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={monitorPill}>{chat.type === 'group' ? 'Group' : 'Direct'}</span>
                    {chat.locality ? <span className={monitorPill}>{chat.locality}</span> : null}
                    <span className={cn(monitorPill, 'bg-[#0b3328] text-[#d8fdd2]')}>{chat.messageCount} msgs</span>
                  </div>
                </div>
              </button>
            ))}

            {!isLoading && displayChats.length === 0 ? (
              <div className="px-4 py-10 text-sm text-[#8696a0]">
                No mirrored chats yet. Group inventory will still appear here after the next sync.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-[#0b141a]">
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
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className={monitorPill}>
                    <MessageSquareIcon className="h-3.5 w-3.5" />
                    {selectedChat.type === 'group' ? 'Group thread' : 'Direct thread'}
                  </span>
                  <span className={monitorPill}>
                    <ActivityIcon className="h-3.5 w-3.5" />
                    {selectedChat.type === 'group' ? 'Group mirror + send' : 'Direct mirror + reply'}
                  </span>
                  {selectedChat.type === 'group' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const jid = selectedChat.remoteJid;
                        const current = selectedChat.isParsing ?? true;
                        try {
                          await backendApi.patch(ENDPOINTS.whatsapp.toggleGroupParsing(jid), { isParsing: !current });
                          setData((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              chats: prev.chats.map((c) =>
                                c.id === jid ? { ...c, isParsing: !current } : c,
                              ),
                            };
                          });
                          setToast(`Parsing ${!current ? 'enabled' : 'paused'} for this group`);
                        } catch {
                          setToast('Failed to toggle parsing');
                        }
                        setTimeout(() => setToast(null), 3000);
                      }}
                      className={cn(
                        monitorPill,
                        'cursor-pointer transition-colors',
                        selectedChat.isParsing ?? true
                          ? 'border-[#00a884] text-[#00a884] hover:bg-[#0a2a20]'
                          : 'border-[#5a3a2a] text-[#ff8a5a] hover:bg-[#2a1a0a]',
                      )}
                      title="Toggle AI message parsing for this group"
                    >
                      <PowerIcon className="h-3 w-3" />
                      {selectedChat.isParsing ?? true ? 'Parsing' : 'Paused'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleClearChat(selectedChat.id)}
                    className={cn(monitorPill, 'border-[#3f2a2a] text-[#ff8a8a] hover:bg-[#2a1a1a] transition-colors')}
                    title="Clear chat from view (does not delete memory or messages)"
                  >
                    Clear chat
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm font-semibold text-white">Choose a chat to monitor</p>
            )}
          </div>

          <div
            className="pulse-scrollbar min-h-0 overflow-y-auto px-4 py-5 sm:px-6"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25px 25px, rgba(255,255,255,0.02) 2px, transparent 0), radial-gradient(circle at 75px 75px, rgba(255,255,255,0.015) 2px, transparent 0)',
              backgroundSize: '100px 100px',
            }}
          >
            {selectedChat ? (
              <div className="mx-auto max-w-[880px] space-y-3">
                {threadPagination.hasMore ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void handleLoadOlder()}
                      disabled={isLoadingOlder}
                      className={monitorSecondaryButton}
                    >
                      {isLoadingOlder ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
                      Load older messages
                    </button>
                  </div>
                ) : null}

                {isThreadLoading && visibleMessages.length === 0 ? (
                  <div className="flex justify-center py-8 text-sm text-[#8696a0]">
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                    Loading thread history...
                  </div>
                ) : null}

                {visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[78%] rounded-[8px] px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.25)]',
                      message.direction === 'outbound'
                        ? 'ml-auto bg-[#005c4b] text-white'
                        : 'bg-[#202c33] text-[#e9edef]',
                    )}
                  >
                    {message.direction === 'inbound' && message.sender ? (
                      <p className="mb-1 text-[11px] font-semibold text-[#53bdeb]">{message.sender}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-[13px] leading-5">{message.text || 'No message text'}</p>
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-[#8696a0]">
                      {message.id.startsWith('optimistic-') ? (
                        <span className="text-[10px] text-[#8696a0]">&#9679;&#9679;&#9679;</span>
                      ) : message.direction === 'outbound' ? (
                        <span className="text-[11px] text-[#53bdeb]">&#10003;&#10003;</span>
                      ) : null}
                      {formatDateTime(message.timestamp)}
                    </div>
                  </div>
                ))}

                {!isThreadLoading && visibleMessages.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[#8696a0]">
                    No saved messages yet for this chat.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#202c33] text-[#8696a0]">
                    <MessageSquareIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">WhatsApp workspace monitor</h3>
                  <p className="mt-2 text-sm leading-6 text-[#8696a0]">
                    Pick a chat from the left and this panel will load mirrored WhatsApp history. Group threads can also be used as direct send surfaces from here.
                  </p>
                </div>
              </div>
            )}
          </div>

          {toast ? (
            <div className="border-t border-[#202c33] bg-[#202c33] px-4 py-2">
              <div className="rounded-lg bg-[#0b3328] px-3 py-2 text-center text-xs text-[#d8fdd2]">
                {toast}
              </div>
            </div>
          ) : null}

          {selectedChat ? (
            <div className="border-t border-[#202c33] bg-[#202c33] px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8696a0]">
                  {selectedChat.type === 'group'
                    ? `Send message to ${selectedChat.title} group`
                    : `Reply to ${selectedChat.title}`}
                </p>
                <div className="flex items-center gap-2">
                  {selectedChat.type === 'group' ? (
                    <span className={monitorPill}>
                      <GroupsIcon className="h-3 w-3" />
                      Group
                    </span>
                  ) : (
                    <span className={monitorPill}>
                      <SmartphoneIcon className="h-3 w-3" />
                      Direct
                    </span>
                  )}
                  <span className={monitorPill}>Enter to send</span>
                </div>
              </div>
              <div className="mx-auto flex max-w-[880px] items-end gap-3">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendReply();
                    }
                  }}
                  placeholder={`Message ${selectedChat.title}...`}
                  rows={1}
                  className="min-h-[46px] max-h-[160px] flex-1 resize-y rounded-[10px] border border-transparent bg-[#111b21] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-[#8696a0] focus:border-[#00a884]"
                />
                <button
                  type="button"
                  onClick={() => void handleSendReply()}
                  disabled={!replyText.trim() || isSending}
                  className={cn(monitorPrimaryButton, 'h-11 w-11 px-0')}
                >
                  {sendStatus === 'sending' ? (
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                  ) : sendStatus === 'sent' ? (
                    <span className="text-sm">&#10003;</span>
                  ) : sendStatus === 'failed' ? (
                    <span className="text-sm">&#10007;</span>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};
