import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { track } from '../services/analytics';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangleIcon,
  ActivityIcon,
  ArrowUpIcon,
  PaperclipIcon,
  TrashIcon,
  WorkflowIcon,
  CheckCircleIcon,
  SmartphoneIcon,
  ShieldCheckIcon,
} from '../lib/icons';

type ChatMessage = {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  route?: string;
};

type RuntimeModel = {
  name: string;
  latency: number;
  status: 'online' | 'offline' | 'checking';
};

type RuntimeStatusPayload = {
  preferredProvider?: 'Google' | 'Groq' | 'OpenRouter' | 'Doubleword';
  providerOrder?: Array<'Google' | 'Groq' | 'OpenRouter' | 'Doubleword'>;
  defaultModel?: string;
  models?: Record<string, RuntimeModel>;
};

const quickActions = [
  {
    label: 'Show callbacks',
    prompt: 'Show my pending callback queue and tell me who I should call first.',
  },
  {
    label: 'Search my CRM',
    prompt: 'Search my CRM for 2BHK buyer requirements in Powai under 70k.',
  },
  {
    label: 'Create channel',
    prompt: 'Create a channel for Bandra West rental listings and urgent buyer requirements.',
  },
  {
    label: 'Web fetch listing',
    prompt: 'Extract the structured details from this property URL: ',
  },
] as const;
const runtimeProviderOrder = ['Google', 'Groq', 'OpenRouter', 'Doubleword'] as const;

const starterMessages: ChatMessage[] = [
  {
    role: 'ai',
    content:
      'Ask me in plain language. I can save listings, save buyer requirements, schedule follow-ups, check the follow-up queue, or search inventory.',
    timestamp: 'Now',
  },
];

function wordCount(text: string) {
  return text.trim().split(' ').filter(Boolean).length;
}

function buildAgentStorageKey(email?: string | null) {
  return `propai_agent_chat:${email?.trim().toLowerCase() || 'guest'}`;
}

function buildAgentDraftStorageKey(email?: string | null) {
  return `propai_agent_chat_draft:${email?.trim().toLowerCase() || 'guest'}`;
}

type RichBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function splitRichBlocks(content: string): RichBlock[] {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: RichBlock[] = [];

  let inCode = false;
  let codeLang: string | null = null;
  let codeLines: string[] = [];
  let paraLines: string[] = [];

  const flushParagraph = () => {
    const text = paraLines.join('\n').trimEnd();
    if (text.trim()) blocks.push({ type: 'paragraph', text });
    paraLines = [];
  };

  const flushCode = () => {
    const code = codeLines.join('\n').replace(/\s+$/g, '');
    blocks.push({ type: 'code', language: codeLang, code });
    codeLines = [];
    codeLang = null;
  };

  const parseTableAt = (startIndex: number) => {
    const header = lines[startIndex];
    const separator = lines[startIndex + 1] || '';
    if (!header.includes('|')) return null;
    if (!/^\s*\|?[\s:-]+\|[\s|:-]*\|?\s*$/.test(separator)) return null;

    const parseRow = (row: string) => row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

    const headers = parseRow(header);
    const rows: string[][] = [];
    let i = startIndex + 2;
    while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
      rows.push(parseRow(lines[i]));
      i += 1;
    }
    return { headers, rows, endIndex: i };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushParagraph();
        inCode = true;
        codeLang = fence[1] || null;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const table = i + 1 < lines.length ? parseTableAt(i) : null;
    if (table) {
      flushParagraph();
      blocks.push({ type: 'table', headers: table.headers, rows: table.rows });
      i = table.endIndex - 1;
      continue;
    }

    paraLines.push(line);
  }

  flushParagraph();
  if (inCode) {
    flushCode();
  }

  return blocks;
}

const RichMessage: React.FC<{ content: string }> = ({ content }) => {
  const blocks = React.useMemo(() => splitRichBlocks(content), [content]);
  const downloadCsv = React.useCallback((headers: string[], rows: string[][], baseName = 'pulse-table') => {
    const escapeCell = (value: string) => {
      const raw = String(value ?? '');
      const needsQuotes = /[",\n]/.test(raw);
      const escaped = raw.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const csv = [
      headers.map(escapeCell).join(','),
      ...rows.map((row) => row.map(escapeCell).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, []);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-[12px] leading-6 text-[var(--text-primary)]"
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[var(--text-secondary)]">Table</p>
                <button
                  type="button"
                  onClick={() => downloadCsv(block.headers, block.rows, `pulse-table-${index + 1}`)}
                  className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-base)]"
                >
                  Download CSV
                </button>
              </div>
              <div className="overflow-x-auto rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)]">
                <table className="min-w-full text-left text-[12px] text-[var(--text-primary)]">
                  <thead className="border-b border-[color:var(--border)] bg-[var(--bg-elevated)]">
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th key={headerIndex} className="px-3 py-2 font-semibold">
                          {header || '—'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-[color:var(--border)] last:border-0">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2 text-[var(--text-secondary)]">
                            {cell || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        return (
          <div key={index} className="whitespace-pre-wrap">
            {block.text}
          </div>
        );
      })}
    </div>
  );
};

export const Agent: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [identityData, setIdentityData] = useState<Record<string, unknown> | null>(null);
  const [selectedModel] = useState('auto');
  const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusPayload | null>(null);
  const [runtimeCheckedAt, setRuntimeCheckedAt] = useState<string | null>(null);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [runtimeNote, setRuntimeNote] = useState<string | null>(null);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; created_at: string; updated_at: string }>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatStorageKey = useMemo(() => buildAgentStorageKey(user?.email), [user?.email]);
  const draftStorageKey = useMemo(() => buildAgentDraftStorageKey(user?.email), [user?.email]);

  const visibleMessages = useMemo(() => messages, [messages]);
  const effectiveRuntimeOrder = useMemo(
    () => runtimeStatus?.providerOrder?.length ? runtimeStatus.providerOrder : runtimeProviderOrder,
    [runtimeStatus],
  );
  const runtimeModels = useMemo(() => {
    const models = runtimeStatus?.models || {};
    return effectiveRuntimeOrder.map((provider) => ({
      provider,
      ...models[provider],
    }));
  }, [effectiveRuntimeOrder, runtimeStatus]);
  const availableProviderCount = useMemo(
    () => runtimeModels.filter((model) => model?.status === 'online').length,
    [runtimeModels],
  );
  const activeRuntimeProvider = useMemo(
    () =>
      effectiveRuntimeOrder.find((provider) => runtimeStatus?.models?.[provider]?.status === 'online') ||
      runtimeStatus?.preferredProvider ||
      null,
    [effectiveRuntimeOrder, runtimeStatus],
  );
  const subscription = user?.subscription;
  const isTrial = subscription?.status === 'trial' || subscription?.status === 'trialing' || subscription?.plan === 'Free' || subscription?.plan === 'Trial';
  const conversationCount = useMemo(() => messages.filter((message) => message.role === 'user').length, [messages]);
  const hasConversation = conversationCount > 0;

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    setShowNewMessagePill(false);
  };

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom('smooth');
    } else {
      setShowNewMessagePill(true);
    }
  }, [messages, isNearBottom]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let mounted = true;

    const loadSessions = async () => {
      try {
        const resp = await backendApi.get<{ sessions: Array<{ id: string; title: string; created_at: string; updated_at: string }> }>(ENDPOINTS.ai.sessions);
        const sessionList = resp.data?.sessions;
        if (mounted && Array.isArray(sessionList) && sessionList.length > 0) {
          setSessions(sessionList);
          if (!activeSessionId) {
            setActiveSessionId(sessionList[0].id);
          }
        }
      } catch { /* sessions unavailable */ }
      if (mounted) setSessionsLoaded(true);
    };

    loadSessions();

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !activeSessionId) return;

    let mounted = true;

    const loadHistory = async () => {
      try {
        const resp = await backendApi.get<{ messages: { role: 'user' | 'ai'; content: string }[] }>(
          `${ENDPOINTS.ai.history}?session_id=${encodeURIComponent(activeSessionId)}`,
        );
        const serverMessages = resp.data?.messages;
        if (mounted && Array.isArray(serverMessages) && serverMessages.length > 0) {
          const withTimestamps = serverMessages.map((msg) => ({
            role: msg.role as 'user' | 'ai',
            content: msg.content,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          setMessages(withTimestamps);
          setChatHydrated(true);
          return;
        }
      } catch {
        // server history unavailable
      }

      try {
        const savedDraft = window.localStorage.getItem(draftStorageKey);
        if (mounted) setInput(savedDraft || '');
      } catch {
        if (mounted) setInput('');
      }

      if (mounted) setChatHydrated(true);
    };

    loadHistory();

    return () => { mounted = false; };
  }, [activeSessionId, draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !chatHydrated || activeSessionId) return;

    try {
      const savedMessages = window.localStorage.getItem(chatStorageKey);
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages) as ChatMessage[];
        if (Array.isArray(parsedMessages) && parsedMessages.length) {
          const validMessages = parsedMessages.filter(
            (message) =>
              (message.role === 'user' || message.role === 'ai') &&
              typeof message.content === 'string' &&
              typeof message.timestamp === 'string',
          );
          setMessages(validMessages.length ? validMessages : starterMessages);
        }
      }
    } catch { /* ignore */ }

    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      setInput(savedDraft || '');
    } catch { /* ignore */ }

    setChatHydrated(true);
  }, [chatHydrated, chatStorageKey, draftStorageKey, activeSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !chatHydrated || activeSessionId) return;

    window.localStorage.setItem(chatStorageKey, JSON.stringify(messages));
  }, [chatHydrated, chatStorageKey, messages, activeSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !chatHydrated || activeSessionId) return;

    if (input.trim()) {
      window.localStorage.setItem(draftStorageKey, input);
      return;
    }

    window.localStorage.removeItem(draftStorageKey);
  }, [chatHydrated, draftStorageKey, input, activeSessionId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setIsNearBottom(distance < 80);
      if (distance < 80) setShowNewMessagePill(false);
    };

    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkAiStatus = async () => {
      try {
        const response = await backendApi.get(ENDPOINTS.ai.status);
        if (!cancelled) {
          const models = response.data?.models || {};
          const available = Object.values(models).some((model: any) => model?.status === 'online');
          setRuntimeStatus(response.data || null);
          setRuntimeCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          setAiStatus(available ? 'online' : 'offline');
          setRuntimeNote(null);
        }
      } catch {
        if (!cancelled) {
          setAiStatus('offline');
          setRuntimeNote('Pulse could not refresh runtime status just now.');
        }
      }
    };

    checkAiStatus();
    const interval = window.setInterval(checkAiStatus, 15000);

    const fetchIdentity = async () => {
      try {
        const resp = await backendApi.get(ENDPOINTS.identity.onboarding);
        if (!cancelled) setIdentityData(resp.data?.data || null);
      } catch { /* identity not set up yet */ }
    };
    fetchIdentity();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
  }, [input]);

	  const ensureSession = async () => {
    if (activeSessionId) return activeSessionId;
    try {
      const resp = await backendApi.post(ENDPOINTS.ai.sessions, { title: 'New Chat' });
      const session = resp.data?.session;
      if (session?.id) {
        setSessions((prev) => [session, ...prev]);
        setActiveSessionId(session.id);
        return session.id;
      }
    } catch { /* ignore */ }
    return null;
  };

  const handleSend = async (text = input) => {
	    const prompt = text.trim();
	    if (!prompt) return;

    track('ai_prompt_sent', {
      words: wordCount(prompt),
      quick_action: text !== input,
    });

    const sessionId = await ensureSession();

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ]);
	    setInput('');
	    setIsTyping(true);

	    try {
	      const response = await backendApi.post(ENDPOINTS.ai.chat, {
	        message: prompt,
	        model: selectedModel,
	        session_id: sessionId,
	        attachments: attachedFiles.map((file) => file.id),
	      });
      const reply = [
        response.data.reply,
        response.data.capability_hint,
        response.data.fallback_error ? `Upstream error: ${response.data.fallback_error}` : '',
      ].filter(Boolean).join('\n\n');
      const route = response.data.route?.intent;
      const workflow = response.data.workflow;
      const modelName = response.data.model || response.data.provider || null;
      track('ai_prompt_completed', {
        route: route || 'unknown',
        words: wordCount(prompt),
      });
      setActiveModelName(modelName);
      if (response.data.fallback_error) {
        setRuntimeNote(`Fallback used: ${response.data.fallback_error}`);
      } else {
        setRuntimeNote(null);
      }

      if (workflow?.type === 'channel_created') {
        window.dispatchEvent(new Event('channels:refresh'));
        window.dispatchEvent(new CustomEvent('channels:created', {
          detail: {
            id: workflow.channel_id,
            name: workflow.name,
          },
        }));
        if (typeof workflow.channel_id === 'string' && workflow.channel_id.trim()) {
          window.setTimeout(() => {
            const encodedName = typeof workflow.name === 'string' && workflow.name.trim()
              ? `&channelName=${encodeURIComponent(workflow.name)}`
              : '';
            navigate(`/stream?channel=${workflow.channel_id}${encodedName}`);
          }, 200);
        }
      }

	      setMessages((prev) => [
	        ...prev,
	        {
	          role: 'ai',
	          content: reply || 'Pulse is ready.',
	          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
	          route,
	        },
	      ]);
	      setAttachedFiles([]);
	      setAttachmentNote(null);
	    } catch (err) {
      console.error(handleApiError(err));
      const isProxyOrNetworkError =
        (err as any)?.response?.status === 502 ||
        (err as any)?.response?.status >= 500 ||
        (err as any)?.code === 'ERR_NETWORK';
      track('ai_prompt_failed', {
        status: (err as any)?.response?.status || 'network',
        route: 'unknown',
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content:
            isProxyOrNetworkError || aiStatus === 'offline'
              ? 'Pulse is temporarily unavailable right now. Please try again in a moment.'
              : 'I could not complete that just now. Please try again in a moment.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setRuntimeNote(`Pulse could not complete that request right now: ${handleApiError(err)}`);
    } finally {
      setIsTyping(false);
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
    }
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const el = inputRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
      }
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentNote, setAttachmentNote] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; fileName: string; mimeType: string | null; byteSize: number; hasText: boolean }>>([]);

  const handleAttachFile = async (file: File) => {
    try {
      setAttachmentNote(null);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const response = await backendApi.post(ENDPOINTS.files.upload, {
        fileName: file.name || 'attachment',
        mimeType: file.type || null,
        base64: dataUrl,
      });

      const uploaded = response.data?.file;
      if (!uploaded?.id) {
        setAttachmentNote('Upload failed: no file id returned.');
        return;
      }

      setAttachedFiles((current) => ([
        ...current,
        {
          id: String(uploaded.id),
          fileName: String(uploaded.fileName || file.name || 'attachment'),
          mimeType: uploaded.mimeType ? String(uploaded.mimeType) : null,
          byteSize: Number(uploaded.byteSize || file.size || 0),
          hasText: Boolean(uploaded.extractedText && String(uploaded.extractedText).trim().length > 0),
        },
      ]).slice(0, 6));

      const hasText = Boolean(uploaded.extractedText && String(uploaded.extractedText).trim().length > 0);
      const status = String(uploaded.extractionStatus || '');
      const note = hasText
        ? `Attached ${uploaded.fileName || file.name} (${Math.round((uploaded.byteSize || file.size) / 1024)} KB)`
        : status === 'failed'
          ? `Attached ${uploaded.fileName || file.name} — OCR failed on this file. Try a clearer scan or paste the text.`
          : `Attached ${uploaded.fileName || file.name} — no text extracted. If this is a scanned PDF/image and OCR isn’t enabled, Pulse can’t read it.`;
      setAttachmentNote(note);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err: any) {
      setAttachmentNote(`Upload failed: ${handleApiError(err)}`);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearChat = async () => {
    if (!activeSessionId) {
      setMessages(starterMessages);
      window.localStorage.removeItem(chatStorageKey);
      return;
    }
    setIsDeleting(true);
    try {
      await backendApi.post(ENDPOINTS.ai.sessionClear(activeSessionId));
    } catch { /* ignore */ }
    setMessages(starterMessages);
    setIsDeleting(false);
    setShowClearConfirm(false);
  };

  const handleNewChat = async () => {
    try {
      const resp = await backendApi.post(ENDPOINTS.ai.sessions, { title: 'New Chat' });
      const session = resp.data?.session;
      if (session?.id) {
        setSessions((prev) => [session, ...prev]);
        setActiveSessionId(session.id);
        setMessages(starterMessages);
      }
    } catch { /* ignore */ }
  };

  const switchSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setMessages(starterMessages);
    try {
      const resp = await backendApi.get<{ messages: { role: 'user' | 'ai'; content: string }[] }>(
        `${ENDPOINTS.ai.history}?session_id=${encodeURIComponent(sessionId)}`,
      );
      const serverMessages = resp.data?.messages;
      if (Array.isArray(serverMessages) && serverMessages.length > 0) {
        const withTimestamps = serverMessages.map((msg) => ({
          role: msg.role as 'user' | 'ai',
          content: msg.content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setMessages(withTimestamps);
      }
    } catch { /* history unavailable */ }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await backendApi.delete(ENDPOINTS.ai.sessionById(sessionId));
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          switchSession(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setMessages(starterMessages);
        }
      }
    } catch { /* ignore */ }
  };

  const showSessionSidebar = sessionsLoaded;

  return (
    <div className="flex gap-4 sm:gap-6">
      {showSessionSidebar ? (
        <aside className="hidden w-[260px] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-[0_20px_70px_rgba(0,0,0,0.22)] sm:flex">
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-3 py-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Chats</span>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[#020f07]"
              title="New chat"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>
          <div className="pulse-scrollbar flex-1 space-y-1 overflow-y-auto px-2 py-3">
            {sessions.length === 0 ? (
              <p className="px-2 text-[11px] text-[var(--text-ghost)]">No chats yet</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-[12px] px-3 py-2 text-[12px] transition-colors',
                    activeSessionId === session.id
                      ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                  )}
                  onClick={() => switchSession(session.id)}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                    className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-ghost)] hover:bg-[rgba(239,68,68,0.15)] hover:text-[var(--red)] group-hover:flex"
                    title="Delete chat"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      ) : null}
      <section className="flex min-h-[calc(100dvh-11rem)] flex-1 flex-col overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-[0_20px_70px_rgba(0,0,0,0.22)] md:min-h-[calc(100vh-160px)]">
        <div className="border-b border-[color:var(--border)] px-4 py-4 sm:px-6 sm:py-5">
          {identityData && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[13px]">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <SmartphoneIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                Devices: {(identityData as any).connected_devices ?? 0}/{(identityData as any).max_devices ?? 2}
              </span>
              {(identityData as any).onboarding_completed ? (
                <span className="flex items-center gap-1.5 text-[var(--accent)]">
                  <CheckCircleIcon className="h-3.5 w-3.5" /> Onboarded
                </span>
              ) : (
                <a href="/onboarding" className="flex items-center gap-1.5 text-[var(--amber)] hover:underline">
                  <ShieldCheckIcon className="h-3.5 w-3.5" /> Setup incomplete
                </a>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">PropAI Pulse</p>
                <h2 className="truncate text-[15px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                  {activeSessionId
                    ? (sessions.find((s) => s.id === activeSessionId)?.title || 'Chat')
                    : 'Agent Chat'}
                </h2>
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Ask Pulse anything about your workspace.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                      aiStatus === 'online'
                        ? 'border-[color:rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.1)] text-[var(--accent)]'
                        : aiStatus === 'checking'
                          ? 'border-[color:rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.1)] text-[var(--amber)]'
                          : 'border-[color:rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.1)] text-[var(--red)]',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        aiStatus === 'online'
                          ? 'bg-[var(--accent)]'
                          : aiStatus === 'checking'
                            ? 'bg-[var(--amber)]'
                            : 'bg-[var(--red)]',
                      )}
                    />
                    {aiStatus === 'online' ? 'AI ready' : aiStatus === 'checking' ? 'Checking AI' : 'Fallback mode'}
                  </div>
                  <div className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    {availableProviderCount} provider{availableProviderCount === 1 ? '' : 's'} ready
                  </div>
                  {activeRuntimeProvider ? (
                    <div className="rounded-full border border-[color:rgba(62,232,138,0.28)] bg-[rgba(62,232,138,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                      Active {activeRuntimeProvider}{activeModelName ? ` · ${activeModelName}` : ''}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 text-[11px] text-[var(--text-secondary)] sm:w-auto sm:items-end">
              <div className="flex items-center gap-2">
                <WorkflowIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>
                  {effectiveRuntimeOrder.join(' -> ')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {showClearConfirm ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-[color:rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.1)] px-3 py-1">
                    <span className="text-[10px] font-semibold text-[var(--red)]">Clear all messages?</span>
                    <button
                      type="button"
                      onClick={handleClearChat}
                      disabled={isDeleting}
                      className="text-[10px] font-bold text-[var(--red)] hover:underline"
                    >
                      {isDeleting ? '...' : 'Yes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      className="text-[10px] text-[var(--text-secondary)] hover:underline"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleNewChat}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-ghost)] transition-colors hover:border-[color:var(--accent-border)] hover:bg-[var(--accent-dim)] hover:text-[var(--accent)]"
                      title="Start a new chat session"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      New
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-ghost)] transition-colors',
                        hasConversation
                          ? 'cursor-pointer hover:border-[color:rgba(239,68,68,0.35)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--red)]'
                          : 'cursor-not-allowed opacity-40',
                      )}
                      title={hasConversation ? 'Clear this conversation and start fresh' : 'No conversation to clear'}
                      disabled={!hasConversation}
                    >
                      <TrashIcon className="h-3 w-3" />
                      Clear
                    </button>
                  </>
                )}
              </div>
              {runtimeCheckedAt ? <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">Updated {runtimeCheckedAt}</div> : null}
            </div>
          </div>
        </div>

        {aiStatus === 'offline' && (
          <div className="mx-4 mt-4 flex items-start gap-3 rounded-[14px] border border-[color:rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-[12px] text-[var(--text-primary)] sm:mx-6">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
            <div>
              <p className="font-semibold">Pulse is connecting to a fallback model right now.</p>
              <p className="mt-1 text-[var(--text-secondary)]">
                You can keep typing. The assistant will use the first available model or tell you exactly what to add in Settings.
              </p>
            </div>
          </div>
        )}

        <div ref={threadRef} className="pulse-scrollbar relative flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            {visibleMessages.map((message, index) => {
              const isAi = message.role === 'ai';

              return (
                <div
                  key={`${index}-${message.timestamp}`}
                  className="group px-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-[48px] shrink-0 pt-[3px]">
                      <div className={cn(
                        'inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em]',
                        isAi ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
                      )}>
                        {isAi ? <ActivityIcon className="h-3 w-3" /> : null}
                        <span>{isAi ? 'Pulse' : 'You'}</span>
                      </div>
                    </div>

                    <div className={cn('min-w-0 flex-1 text-[13px] leading-6 sm:leading-7', isAi ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
                      <RichMessage content={message.content} />
                    </div>

                    <div className="hidden min-w-[72px] text-right sm:block">
                      <span className="inline-block text-[10px] font-medium text-[var(--text-ghost)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        {message.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="group px-0">
                <div className="flex items-start gap-3">
                  <div className="w-[48px] shrink-0 pt-[3px]">
                    <div className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
                      <ActivityIcon className="h-3 w-3" />
                      <span>Pulse</span>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2.5 pt-1">
                    <div className="pulse-agent-spinner" aria-hidden="true">
                      <div className="pulse-agent-spinner-inner" />
                    </div>
                    <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
                      Thinking through the model chain.
                    </p>
                  </div>

                  <div className="hidden min-w-[72px] sm:block" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {showNewMessagePill && (
            <button
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-1 text-[10px] font-bold text-[#020f07] transition-transform duration-150 hover:scale-[1.02]"
            >
              New message
            </button>
          )}
        </div>

 	        <div className="border-t border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-4 sm:px-6">
 	          <div className="space-y-3">
 	            <div className="flex items-end gap-2">
 		              <input
 		                ref={fileInputRef}
 		                type="file"
 		                accept=".txt,.csv,.md,.json,.pdf,text/plain,text/csv,application/json,application/pdf"
 		                className="hidden"
 		                onChange={(e) => {
 		                  const file = e.target.files?.[0] || null;
 		                  if (file) {
 	                    void handleAttachFile(file);
 	                  }
 	                  e.currentTarget.value = '';
 	                }}
 	              />
 	              <button
 	                type="button"
 	                onClick={() => fileInputRef.current?.click()}
 	                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[#020f07]"
 	                aria-label="Attach file"
 	              >
 	                <PaperclipIcon className="h-4 w-4" />
 	              </button>
 	              <textarea
 	                ref={inputRef}
 	                value={input}
 	                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
 	                placeholder="Ask Pulse anything..."
 	                rows={1}
 	                className="min-h-[36px] flex-1 resize-none border-b border-[color:var(--border-strong)] bg-transparent py-2 text-[13px] font-normal text-[var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-[color:var(--accent)]"
 	              />

 	              <button
 	                onClick={() => handleSend()}
 	                className={cn(
 	                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07] transition-all duration-150',
 	                  (input.trim() || attachedFiles.length > 0) ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0',
 	                )}
 	                aria-label="Send"
 	              >
 	                <ArrowUpIcon className="h-4 w-4" strokeWidth={2.5} />
 	              </button>
 	            </div>

		            {attachmentNote ? (
		              <div className="text-[11px] text-[var(--text-secondary)]">{attachmentNote}</div>
		            ) : null}

		            {attachedFiles.length > 0 ? (
		              <div className="flex flex-wrap gap-2">
		                {attachedFiles.map((file) => (
		                  <button
		                    key={file.id}
		                    type="button"
		                    onClick={() => setAttachedFiles((current) => current.filter((f) => f.id !== file.id))}
		                    className={cn(
		                      'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold transition',
		                      file.hasText
		                        ? 'border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.08)] text-[var(--accent)]'
		                        : 'border-[color:rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] text-[var(--amber)]',
		                    )}
		                    title="Click to remove"
		                  >
		                    <PaperclipIcon className="h-3 w-3" />
		                    <span className="max-w-[220px] truncate">{file.fileName}</span>
		                    <span className="opacity-70">×</span>
		                  </button>
		                ))}
		              </div>
		            ) : null}

		            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
