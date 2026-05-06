import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  ChevronRightIcon,
  GlobeIcon,
  RefreshIcon,
  WorkflowIcon,
  XIcon,
} from '../lib/icons';
import { ProviderLogo } from '../components/ui/ProviderLogo';

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
  models?: Record<string, RuntimeModel>;
};

type AssistantPanelTab = 'runtime' | 'activity' | 'browser';

type PanelActivityTone = 'neutral' | 'success' | 'warning';

type PanelActivityItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: PanelActivityTone;
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
const assistantPanelTabs = [
  { id: 'runtime' as const, label: 'Runtime', icon: ActivityIcon },
  { id: 'activity' as const, label: 'Activity', icon: WorkflowIcon },
  { id: 'browser' as const, label: 'Browser', icon: GlobeIcon },
];
const browserTools = [
  {
    id: 'web_fetch',
    label: 'Web fetch',
    description: 'Read the contents of a listing or project URL when you paste a page into Pulse.',
    prompt: 'Fetch the key details from this listing URL: ',
  },
  {
    id: 'search_web',
    label: 'Web search',
    description: 'Search the web for local market context, project details, or builder information.',
    prompt: 'Search the web for current real estate updates in ',
  },
  {
    id: 'verify_rera',
    label: 'RERA verify',
    description: 'Check a project registration before sharing it with a buyer or landlord.',
    prompt: 'Verify the RERA registration for ',
  },
  {
    id: 'fetch_property_listing',
    label: 'Listing extract',
    description: 'Convert a property portal URL into structured listing details for saving or matching.',
    prompt: 'Extract the structured details from this property URL: ',
  },
] as const;
const activityToneStyles: Record<PanelActivityTone, string> = {
  neutral: 'border-[color:var(--border)] bg-[var(--bg-elevated)]',
  success: 'border-[color:rgba(34,197,94,0.22)] bg-[rgba(37,211,102,0.08)]',
  warning: 'border-[color:rgba(245,158,11,0.22)] bg-[rgba(245,158,11,0.08)]',
};

const formatPlanDate = (value?: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
};

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

function truncateCopy(value: string, limit = 112) {
  const compact = value.split(' ').filter(Boolean).join(' ').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(limit - 3, 0)).trimEnd()}...`;
}

function formatIntentLabel(intent?: string) {
  if (!intent) return 'General answer';
  return intent
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function buildAgentStorageKey(email?: string | null) {
  return `propai_agent_chat:${email?.trim().toLowerCase() || 'guest'}`;
}

function buildAgentDraftStorageKey(email?: string | null) {
  return `propai_agent_chat_draft:${email?.trim().toLowerCase() || 'guest'}`;
}

export const Agent: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isAssistantPanelOpen, setIsAssistantPanelOpen] = useState(false);
  const [assistantPanelTab, setAssistantPanelTab] = useState<AssistantPanelTab>('runtime');
  const [selectedModel] = useState('auto');
  const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusPayload | null>(null);
  const [runtimeCheckedAt, setRuntimeCheckedAt] = useState<string | null>(null);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [runtimeNote, setRuntimeNote] = useState<string | null>(null);
  const [chatHydrated, setChatHydrated] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatStorageKey = useMemo(() => buildAgentStorageKey(user?.email), [user?.email]);
  const draftStorageKey = useMemo(() => buildAgentDraftStorageKey(user?.email), [user?.email]);

  const visibleMessages = useMemo(() => messages, [messages]);
  const runtimeModels = useMemo(() => {
    const models = runtimeStatus?.models || {};
    return runtimeProviderOrder.map((provider) => ({
      provider,
      ...models[provider],
    }));
  }, [runtimeStatus]);
  const availableProviderCount = useMemo(
    () => runtimeModels.filter((model) => model?.status === 'online').length,
    [runtimeModels],
  );
  const activeRuntimeProvider = useMemo(
    () => runtimeProviderOrder.find((provider) => runtimeStatus?.models?.[provider]?.status === 'online') || null,
    [runtimeStatus],
  );
  const subscription = user?.subscription;
  const isTrial = subscription?.status === 'trial' || subscription?.status === 'trialing' || subscription?.plan === 'Free';
  const conversationCount = useMemo(() => messages.filter((message) => message.role === 'user').length, [messages]);
  const aiReplyCount = useMemo(() => Math.max(messages.filter((message) => message.role === 'ai').length - 1, 0), [messages]);
  const hasConversation = conversationCount > 0;
  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'user') || null,
    [messages],
  );
  const latestAiMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message, index) => message.role === 'ai' && (conversationCount > 0 || index < messages.length - 1)) || null,
    [conversationCount, messages],
  );
  const showPlanPanel = Boolean(subscription) && !hasConversation;
  const showAssistantRail = isAssistantPanelOpen;
  const panelHasAttention = aiStatus !== 'online' || Boolean(runtimeNote);
  const latestIntentLabel = latestAiMessage?.route ? formatIntentLabel(latestAiMessage.route) : 'General answer';
  const activityItems = useMemo<PanelActivityItem[]>(() => {
    const items: PanelActivityItem[] = [];

    if (isTyping) {
      items.push({
        id: 'typing',
        title: 'Pulse is working',
        detail: 'Thinking through runtime and tool routing for the current request.',
        timestamp: 'Live',
        tone: 'neutral',
      });
    }

    if (latestUserMessage) {
      items.push({
        id: `user-${latestUserMessage.timestamp}`,
        title: 'Latest request',
        detail: truncateCopy(latestUserMessage.content, 104),
        timestamp: latestUserMessage.timestamp,
        tone: 'neutral',
      });
    }

    if (latestAiMessage && (conversationCount > 0 || latestAiMessage !== starterMessages[0])) {
      items.push({
        id: `ai-${latestAiMessage.timestamp}`,
        title: latestAiMessage.route ? formatIntentLabel(latestAiMessage.route) : 'Latest reply',
        detail: truncateCopy(latestAiMessage.content, 116),
        timestamp: latestAiMessage.timestamp,
        tone: latestAiMessage.route && latestAiMessage.route !== 'general_answer' ? 'success' : 'neutral',
      });
    }

    if (runtimeNote) {
      items.push({
        id: 'runtime-note',
        title: 'Runtime note',
        detail: runtimeNote,
        timestamp: runtimeCheckedAt || 'Now',
        tone: 'warning',
      });
    }

    if (runtimeCheckedAt) {
      items.push({
        id: 'runtime-check',
        title: aiStatus === 'online' ? 'Providers ready' : aiStatus === 'checking' ? 'Checking providers' : 'Fallback mode active',
        detail: activeRuntimeProvider
          ? `${activeRuntimeProvider}${activeModelName ? ` is leading with ${activeModelName}.` : ' is leading the model chain.'}`
          : 'Pulse is waiting for the first available provider in the chain.',
        timestamp: runtimeCheckedAt,
        tone: aiStatus === 'offline' ? 'warning' : aiStatus === 'online' ? 'success' : 'neutral',
      });
    }

    if (!items.length) {
      items.push({
        id: 'starter',
        title: 'Pulse ready',
        detail: 'Open the contextual panel to inspect runtime, recent activity, and browser tools.',
        timestamp: 'Now',
        tone: 'neutral',
      });
    }

    return items.slice(0, 5);
  }, [
    activeModelName,
    activeRuntimeProvider,
    aiStatus,
    conversationCount,
    isTyping,
    latestAiMessage,
    latestUserMessage,
    runtimeCheckedAt,
    runtimeNote,
  ]);

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
        } else {
          setMessages(starterMessages);
        }
      } else {
        setMessages(starterMessages);
      }
    } catch {
      setMessages(starterMessages);
    }

    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      setInput(savedDraft || '');
    } catch {
      setInput('');
    }

    setChatHydrated(true);
  }, [chatStorageKey, draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !chatHydrated) return;

    window.localStorage.setItem(chatStorageKey, JSON.stringify(messages));
  }, [chatHydrated, chatStorageKey, messages]);

  useEffect(() => {
    if (typeof window === 'undefined' || !chatHydrated) return;

    if (input.trim()) {
      window.localStorage.setItem(draftStorageKey, input);
      return;
    }

    window.localStorage.removeItem(draftStorageKey);
  }, [chatHydrated, draftStorageKey, input]);

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

  const handleSend = async (text = input) => {
    const prompt = text.trim();
    if (!prompt) return;

    track('ai_prompt_sent', {
      words: wordCount(prompt),
      quick_action: text !== input,
    });

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await backendApi.post(ENDPOINTS.ai.chat, { message: prompt, model: selectedModel });
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

  const openAssistantPanel = (tab: AssistantPanelTab = 'runtime') => {
    setAssistantPanelTab(tab);
    setIsAssistantPanelOpen(true);
  };

  return (
    <div className={cn('grid gap-4 sm:gap-6', showAssistantRail && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
      <section className="flex min-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-[0_20px_70px_rgba(0,0,0,0.22)] md:min-h-[calc(100vh-160px)]">
        <div className="border-b border-[color:var(--border)] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => openAssistantPanel('runtime')}
                onDoubleClick={() => openAssistantPanel('runtime')}
                aria-controls="agent-side-panel"
                aria-expanded={isAssistantPanelOpen}
                className={cn(
                  'inline-flex items-center gap-3 rounded-[18px] border px-3 py-2 text-left transition-all',
                  isAssistantPanelOpen
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] shadow-[0_16px_36px_rgba(0,0,0,0.18)]'
                    : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <ActivityIcon className="h-4 w-4 text-[var(--accent)]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    {isAssistantPanelOpen ? 'Context open' : 'Open context'}
                  </span>
                  <span className="mt-1 block text-[14px] font-semibold tracking-[-0.02em]">Pulse</span>
                </span>
                <span className={cn('h-2.5 w-2.5 rounded-full', panelHasAttention ? 'bg-[var(--amber)]' : 'bg-[var(--accent)]')} />
                <ChevronRightIcon className={cn('h-4 w-4 transition-transform', isAssistantPanelOpen && 'rotate-90')} />
              </button>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">PropAI Pulse</p>
                <h2 className="text-[15px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Agent Chat</h2>
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Click Pulse to open runtime, activity, and browser tools in the third panel.</p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 text-[11px] text-[var(--text-secondary)] sm:w-auto sm:items-end">
              <div className="flex items-center gap-2">
                <WorkflowIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Gemini first, Groq and OpenRouter fallback</span>
              </div>
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
                {aiStatus === 'online' ? 'AI online' : aiStatus === 'checking' ? 'Checking AI' : 'AI offline'}
              </div>
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
              const bubbleBase = 'w-full max-w-full rounded-[18px] border px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.12)] sm:max-w-[min(760px,90%)]';

              return (
                <motion.div
                  key={`${index}-${message.timestamp}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={cn('flex', isAi ? 'justify-start' : 'justify-end')}
                >
                  <div className={cn(bubbleBase, isAi ? 'border-[color:var(--border)] bg-[var(--bg-elevated)]' : 'border-[color:var(--accent-border)] bg-[rgba(37,211,102,0.06)]')}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {isAi ? <ActivityIcon className="h-3 w-3 text-[var(--accent)]" /> : null}
                        <span>{isAi ? 'Pulse' : 'You'}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)]">{message.timestamp}</span>
                    </div>
                    <div className={cn('text-[13px] leading-6 sm:leading-7', isAi ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
                      {message.content.split('\n').map((line, lineIndex) => (
                        <React.Fragment key={lineIndex}>
                          {lineIndex > 0 && <br />}
                          {line}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {isTyping && (
              <div className="flex justify-start">
                <div className="w-full max-w-full rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.12)] sm:max-w-[min(760px,90%)]">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    <ActivityIcon className="h-3 w-3 text-[var(--accent)]" />
                    <span>Pulse</span>
                  </div>
                  <div className="flex items-center gap-2.5 pt-1">
                    <div className="pulse-agent-spinner" aria-hidden="true">
                      <div className="pulse-agent-spinner-inner" />
                    </div>
                    <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
                      Thinking through the model chain.
                    </p>
                  </div>
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
            <div className="relative">
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
                className="w-full resize-none border-b border-[color:var(--border)] bg-transparent py-2 pr-10 text-[13px] font-normal text-[var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-[color:var(--accent)]"
              />

              <button
                onClick={() => handleSend()}
                className={cn(
                  'absolute right-0 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07] transition-all duration-150',
                  input.trim() ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0',
                )}
                aria-label="Send"
              >
                <ArrowUpIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>

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

      <AnimatePresence initial={false}>
        {showAssistantRail ? (
          <motion.aside
            id="agent-side-panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-[0_20px_70px_rgba(0,0,0,0.22)] lg:sticky lg:top-6 lg:self-start"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <ActivityIcon className="h-4.5 w-4.5 text-[var(--accent)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Pulse</p>
                  <h3 className="mt-1 truncate text-[14px] font-semibold text-[var(--text-primary)]">Context Panel</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAssistantPanelOpen(false)}
                className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--text-primary)]"
                aria-label="Close context panel"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[color:var(--border)] px-3 py-3">
              <div className="grid grid-cols-3 gap-2">
                {assistantPanelTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAssistantPanelTab(id)}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-[14px] border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      assistantPanelTab === id
                        ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                        : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pulse-scrollbar max-h-[calc(100dvh-14rem)] overflow-y-auto p-4 sm:p-5">
              {assistantPanelTab === 'runtime' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Runtime</p>
                      <h4 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">Live model chain</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void backendApi
                          .get(ENDPOINTS.ai.status)
                          .then((response) => {
                            const models = response.data?.models || {};
                            const available = Object.values(models).some((model: any) => model?.status === 'online');
                            setRuntimeStatus(response.data || null);
                            setRuntimeCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                            setAiStatus(available ? 'online' : 'offline');
                            setRuntimeNote(null);
                          })
                          .catch(() => {
                            setAiStatus('offline');
                            setRuntimeNote('Pulse could not refresh runtime status just now.');
                          });
                      }}
                      className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                      aria-label="Refresh runtime"
                    >
                      <RefreshIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                        aiStatus === 'online'
                          ? 'border-[color:rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] text-[var(--accent)]'
                          : aiStatus === 'checking'
                            ? 'border-[color:rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] text-[var(--amber)]'
                            : 'border-[color:rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]',
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
                      {aiStatus === 'online' ? 'Ready' : aiStatus === 'checking' ? 'Checking' : 'Fallback mode'}
                    </div>
                    <div className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      {availableProviderCount} provider{availableProviderCount === 1 ? '' : 's'} ready
                    </div>
                    {activeRuntimeProvider && (
                      <div className="rounded-full border border-[color:rgba(37,211,102,0.28)] bg-[rgba(37,211,102,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                        Active: {activeRuntimeProvider}
                      </div>
                    )}
                  </div>

                  {runtimeCheckedAt && (
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      Checked {runtimeCheckedAt}
                      {activeModelName ? ` | Last model ${activeModelName}` : ''}
                    </p>
                  )}

                  {runtimeNote && (
                    <div className="rounded-[14px] border border-[color:rgba(245,158,11,0.22)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-[12px] leading-6 text-[var(--text-primary)]">
                      {runtimeNote}
                    </div>
                  )}

                  <div className="space-y-3">
                    {runtimeModels.map((item) => {
                      const status = item?.status || 'offline';
                      const providerKey = (item.provider === 'Google' ? 'gemini' : item.provider.toLowerCase()) as 'gemini' | 'groq' | 'openrouter' | 'doubleword';
                      return (
                        <div key={item.provider} className="flex items-start gap-3 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]">
                            <ProviderLogo provider={providerKey} className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{item.name || item.provider}</p>
                              <span
                                className={cn(
                                  'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
                                  status === 'online'
                                    ? 'border-[color:rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] text-[var(--accent)]'
                                    : 'border-[color:rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]',
                                )}
                              >
                                {status === 'online' ? 'online' : 'offline'}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                              {status === 'online'
                                ? `Latency ${item.latency >= 0 ? `${item.latency}ms` : 'ready'}`
                                : 'Add key in Settings'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Chain order</p>
                    <div className="mt-3 space-y-3">
                      {[
                        { label: 'Gemini', desc: 'Google Gemini 2.5 Flash is the primary model path' },
                        { label: 'Groq', desc: 'Fast fallback if Gemini is unavailable' },
                        { label: 'OpenRouter', desc: 'Third fallback through your OpenRouter key' },
                      ].map((item, index) => (
                        <div key={item.label} className="flex items-start gap-3 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[10px] font-bold text-[var(--accent)]">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.label}</p>
                            <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {showPlanPanel && subscription ? (
                    <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Workspace plan</p>
                          <h4 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">
                            {isTrial ? '7-day free trial' : subscription.plan}
                          </h4>
                        </div>
                        <ActivityIcon className="h-4 w-4 text-[var(--accent)]" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-3">
                          <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Activated</p>
                          <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{formatPlanDate(subscription.created_at)}</p>
                        </div>
                        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-3">
                          <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Expires</p>
                          <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{formatPlanDate(subscription.renewal_date)}</p>
                        </div>
                      </div>
                      {typeof subscription.trial_days_remaining === 'number' ? (
                        <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                          {subscription.trial_days_remaining} day{subscription.trial_days_remaining === 1 ? '' : 's'} left on this workspace.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : assistantPanelTab === 'activity' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Activity</p>
                    <h4 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">Recent Pulse actions</h4>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Requests</p>
                      <p className="mt-1 text-[18px] font-semibold text-[var(--text-primary)]">{conversationCount}</p>
                    </div>
                    <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Replies</p>
                      <p className="mt-1 text-[18px] font-semibold text-[var(--text-primary)]">{aiReplyCount}</p>
                    </div>
                    <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Latest route</p>
                      <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{latestIntentLabel}</p>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Timeline</p>
                        <h4 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">Contextual activity</h4>
                      </div>
                      {runtimeCheckedAt ? <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">Updated {runtimeCheckedAt}</span> : null}
                    </div>

                    <div className="mt-4 space-y-3">
                      {activityItems.map((item) => (
                        <div key={item.id} className={cn('rounded-[14px] border px-4 py-3', activityToneStyles[item.tone])}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.title}</p>
                              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{item.detail}</p>
                            </div>
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">{item.timestamp}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 text-[12px] leading-6 text-[var(--text-secondary)]">
                    Pulse routes requests to tools automatically. Ask naturally and the latest intent, provider status, and response flow will show up here.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Browser</p>
                    <h4 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">Contextual web tools</h4>
                    <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                      Use Pulse to fetch listing pages, search the web, verify RERA, or extract structured property data without leaving the chat thread.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {browserTools.map((tool) => (
                      <div key={tool.id} className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[12px] font-semibold text-[var(--text-primary)]">{tool.label}</p>
                              <span className="rounded-full border border-[color:rgba(37,211,102,0.28)] bg-[rgba(37,211,102,0.08)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                                Ready
                              </span>
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{tool.description}</p>
                          </div>
                          <span className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                            {tool.id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleQuickAction(tool.prompt);
                            openAssistantPanel('browser');
                          }}
                          className="mt-3 rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                        >
                          Use prompt
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
