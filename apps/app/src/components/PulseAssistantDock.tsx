import React from 'react';
import { useLocation } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { ArrowUpIcon, LoaderIcon, MessageSquareTextIcon, SparklesIcon, XIcon } from '../lib/icons';
import { cn } from '../lib/utils';

type DockMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const getRouteContext = (pathname: string) => {
  if (pathname.startsWith('/stream')) {
    return {
      title: 'Stream helper',
      intro: 'Ask Pulse to match, summarize, or draft replies from live stream context.',
      prompts: [
        'Find the best matching requirements for the current stream items.',
        'Draft a crisp broker reply for the strongest listing here.',
        'Summarize today’s fresh inventory into action points.',
      ],
    };
  }

  if (pathname.startsWith('/whatsapp')) {
    return {
      title: 'WhatsApp setup helper',
      intro: 'Ask Pulse to diagnose webhook, token, Cloud API, or linked-device issues.',
      prompts: [
        'Explain my current WhatsApp Cloud API setup state.',
        'What should I check if incoming messages are not reaching PropAI?',
        'Tell me the difference between Cloud API and linked-device status.',
      ],
    };
  }

  if (pathname.startsWith('/parsing-terminal')) {
    return {
      title: 'Parsing helper',
      intro: 'Ask Pulse to explain feed faults, group coverage, and parse activity.',
      prompts: [
        'Explain the current parsing terminal state in plain language.',
        'What should I check when the feed says network error?',
        'How do I know whether Cloud API messages are being parsed?',
      ],
    };
  }

  if (pathname.startsWith('/broker-network')) {
    return {
      title: 'Broker network helper',
      intro: 'Ask Pulse to reason about coverage, overlaps, and follow-ups.',
      prompts: [
        'Which broker contacts should I prioritize today?',
        'Find overlap signals by locality and broker strength.',
        'Draft a follow-up note for a broker partner.',
      ],
    };
  }

  if (pathname.startsWith('/broadcast')) {
    return {
      title: 'Broadcast helper',
      intro: 'Ask Pulse to draft campaigns, segment lists, or tighten copy.',
      prompts: [
        'Draft a Hinglish broadcast for a premium 2BHK listing.',
        'Make this campaign shorter and more broker-friendly.',
        'What audience should I send this broadcast to?',
      ],
    };
  }

  if (pathname.startsWith('/igr')) {
    return {
      title: 'IGR helper',
      intro: 'Ask Pulse to plan price checks and interpret market-rate evidence.',
      prompts: [
        'How should I verify a building price using IGR?',
        'Explain what evidence I need before countering a lowball offer.',
        'Summarize the latest market-rate check into a broker reply.',
      ],
    };
  }

  return {
    title: 'Pulse helper',
    intro: 'Ask about listings, requirements, follow-ups, IGR checks, or WhatsApp setup.',
    prompts: [
      'Show me urgent follow-ups I should handle first.',
      'Find fresh buyer requirements for 2BHK and 3BHK today.',
      'Help me match inventory against active requirements.',
    ],
  };
};

export const PulseAssistantDock: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<DockMessage[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const context = React.useMemo(() => getRouteContext(location.pathname), [location.pathname]);

  React.useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [isOpen, messages]);

  const sendPrompt = React.useCallback(async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || isSending) {
      return;
    }

    setInput('');
    setError(null);
    setIsSending(true);
    setIsOpen(true);
    setMessages((current) => [...current, { role: 'user', content: prompt }]);

    try {
      const response = await backendApi.post(ENDPOINTS.ai.chat, {
        prompt: [
          `Current app route: ${location.pathname}`,
          `Current helper context: ${context.title}`,
          prompt,
        ].join('\n\n'),
        pathname: location.pathname,
      });
      const reply = String(response.data?.reply || response.data?.text || 'Pulse did not return a reply.').trim();
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      setMessages((current) => [...current, { role: 'assistant', content: `I could not reach Pulse right now. ${message}` }]);
    } finally {
      setIsSending(false);
    }
  }, [context.title, isSending, location.pathname]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendPrompt(input);
  };

  return (
    <div className="fixed bottom-4 right-4 z-30 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {isOpen ? (
        <section className="flex h-[min(620px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[rgba(13,17,23,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <header className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="truncate text-[13px] font-bold text-[var(--text-primary)]">{context.title}</h2>
              </div>
              <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{context.intro}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              aria-label="Close Pulse helper"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[12px] leading-5 text-[var(--text-secondary)]">{context.intro}</p>
                <div className="flex flex-wrap gap-2">
                  {context.prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendPrompt(prompt)}
                      className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--text-primary)] transition hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  'rounded-[12px] border px-3 py-2 text-[12px] leading-5',
                  message.role === 'user'
                    ? 'ml-8 border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                    : 'mr-8 border-[color:var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]',
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}

            {isSending ? (
              <div className="mr-8 flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                Pulse is checking context
              </div>
            ) : null}
            <div ref={scrollRef} />
          </div>

          {error ? (
            <div className="border-t border-[color:rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] px-4 py-2 text-[11px] text-[var(--red)]">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] p-3">
            <div className="flex items-end gap-2 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendPrompt(input);
                  }
                }}
                rows={2}
                placeholder="Ask Pulse in this context..."
                className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-ghost)]"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-[#021208] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Send to Pulse"
              >
                {isSending ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ArrowUpIcon className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-12 items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 text-[12px] font-bold uppercase tracking-[0.08em] text-[#021208] shadow-[0_18px_60px_rgba(62,232,138,0.22)] transition hover:brightness-95"
        aria-expanded={isOpen}
      >
        <MessageSquareTextIcon className="h-4 w-4" />
        Ask Pulse
      </button>
    </div>
  );
};
