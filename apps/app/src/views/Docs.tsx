import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActivityIcon,
  BookOpenIcon,
  CallbackIcon,
  GlobeIcon,
  GroupsIcon,
  MessageSquareTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  StreamIcon,
  WorkflowIcon,
} from '../lib/icons';

const apiReferenceSections = [
  {
    title: 'Auth',
    base: '/api/auth',
    auth: 'Public except /me',
    endpoints: [
      { method: 'POST', path: '/request-login-link', note: 'Create a WhatsApp login code for the registered number.' },
      { method: 'GET', path: '/me', note: 'Get current authenticated user state.' },
      { method: 'POST', path: '/me', note: 'Update current profile name.' },
      { method: 'POST', path: '/refresh', note: 'Refresh auth session.' },
    ],
  },
  {
    title: 'WhatsApp',
    base: '/api/whatsapp',
    auth: 'Bearer token required',
    endpoints: [
      { method: 'GET', path: '/status', note: 'Get live WhatsApp session status and connected numbers.' },
      { method: 'GET', path: '/cloud/config', note: 'Read the official Cloud API configuration.' },
      { method: 'POST', path: '/cloud/config', note: 'Save official Cloud API configuration.' },
      { method: 'GET', path: '/monitor/messages', note: 'Load thread messages for a chat.' },
      { method: 'POST', path: '/send', note: 'Send one direct WhatsApp message.' },
      { method: 'POST', path: '/send-bulk', note: 'Send bulk direct WhatsApp messages.' },
      { method: 'POST', path: '/broadcast', note: 'Broadcast to selected groups using a session.' },
      { method: 'GET', path: '/health', note: 'High-level ingestion health.' },
      { method: 'GET', path: '/health/logs', note: 'Detailed health logs and recent failures.' },
      { method: 'GET', path: '/events', note: 'Session and parser event feed.' },
    ],
  },
  {
    title: 'Workspace',
    base: '/api/workspace',
    auth: 'Bearer token required',
    endpoints: [
      { method: 'GET', path: '/overview', note: 'Workspace summary and account context.' },
      { method: 'GET', path: '/team', note: 'Workspace team roster and sessions.' },
      { method: 'POST', path: '/team', note: 'Add a workspace member.' },
      { method: 'PATCH', path: '/team/:memberId', note: 'Update member role, status, or lane access.' },
      { method: 'GET', path: '/activity', note: 'Workspace activity feed.' },
      { method: 'GET', path: '/metadata', note: 'Read workspace profile metadata.' },
      { method: 'POST', path: '/metadata', note: 'Save workspace profile metadata.' },
      { method: 'GET', path: '/referral', note: 'Referral program state and share data.' },
    ],
  },
  {
    title: 'AI',
    base: '/api/ai',
    auth: 'Bearer token required',
    endpoints: [
      { method: 'POST', path: '/chat', note: 'Run the main AI chat/completion flow.' },
      { method: 'GET', path: '/models', note: 'List configured AI models/providers.' },
      { method: 'GET', path: '/status', note: 'Current AI availability and config health.' },
      { method: 'GET', path: '/usage', note: 'Usage counters and cost/limits snapshot.' },
      { method: 'POST', path: '/usage/reset', note: 'Reset tracked usage state.' },
      { method: 'GET', path: '/history', note: 'Recent AI history.' },
      { method: 'GET', path: '/sessions', note: 'Conversation session list.' },
      { method: 'GET', path: '/sessions/:id', note: 'Fetch one AI session.' },
      { method: 'POST', path: '/sessions/:id/clear', note: 'Clear one AI session.' },
    ],
  },
  {
    title: 'Channels And Stream',
    base: '/api/channels and /api/stream-items',
    auth: 'Bearer token required',
    endpoints: [
      { method: 'GET', path: '/api/channels', note: 'List channels.' },
      { method: 'POST', path: '/api/channels', note: 'Create a channel.' },
      { method: 'GET', path: '/api/channels/stream', note: 'Fetch channel stream items.' },
      { method: 'GET', path: '/api/channels/stream/summary', note: 'Get stream summary metrics.' },
      { method: 'POST', path: '/api/channels/stream/rebuild', note: 'Rebuild channel stream state.' },
      { method: 'POST', path: '/api/channels/:channelId/read', note: 'Mark a channel as read.' },
      { method: 'POST', path: '/api/channels/:channelId/items', note: 'Attach an item to a channel.' },
      { method: 'GET', path: '/api/stream-items', note: 'List stream items directly.' },
      { method: 'POST', path: '/api/stream-items/:streamItemId/read', note: 'Mark a stream item as read.' },
      { method: 'POST', path: '/api/stream-items/:streamItemId/correct', note: 'Correct a parsed stream item.' },
    ],
  },
];

const capabilitySections = [
  {
    title: 'Pulse assistant',
    icon: ActivityIcon,
    copy: 'Ask Pulse from the dock in plain language to send messages, search your CRM, create channels, summarize activity, or answer product questions.',
    examples: [
      'Show my pending callback queue and tell me who I should call first.',
      'Search my CRM for 2BHK buyer requirements in Powai under 70k.',
      'Send a message to 9773757759 saying hello from PropAI Pulse.',
    ],
    href: '/dashboard',
  },
  {
    title: 'Stream',
    icon: StreamIcon,
    copy: 'Track live WhatsApp intake, filter listings and requirements, and review parsed items before routing or follow-up.',
    examples: [
      'Open Stream and filter only broker-tagged items.',
      'Review all new Andheri rental listings from today.',
      'Spot stale or incomplete posts before sharing.',
    ],
    href: '/stream',
  },
  {
    title: 'Channels',
    icon: WorkflowIcon,
    copy: 'Create personal channels around localities, deal types, budgets, or urgency so Pulse can auto-route matching items.',
    examples: [
      'Create a channel for Bandra West rental listings.',
      'Track urgent buyer requirements in Powai and Hiranandani.',
      'Pin your highest-signal channels in the sidebar.',
    ],
    href: '/stream',
  },
  {
    title: 'WhatsApp',
    icon: GroupsIcon,
    copy: 'Connect broker numbers, scan QR, review ingestion health, review groups, and disconnect devices cleanly when needed.',
    examples: [
      'Connect your broker number and scan the QR.',
      'Open Logs to see groups detected and parser health.',
      'Disconnect a session when you want to move devices.',
    ],
    href: '/whatsapp',
  },
  {
    title: 'CRM Memory',
    icon: MessageSquareTextIcon,
    copy: 'Save listings, requirements, follow-ups, and prior chat context so Pulse can answer follow-up questions with memory.',
    examples: [
      'Save this buyer requirement for Lower Parel under 4 cr.',
      'What did I save yesterday for Powai rentals?',
      'Sent? / do it / what about that one?',
    ],
    href: '/dashboard',
  },
  {
    title: 'Web Tools',
    icon: GlobeIcon,
    copy: 'Use browser-backed search and fetch tools to pull listing details, RERA context, and project information from the web.',
    examples: [
      'Web fetch this property URL.',
      'Search the web for current MahaRERA updates.',
      'Extract structured details from a MagicBricks listing.',
    ],
    href: '/dashboard',
  },
];

const howToUse = [
  {
    title: 'Talk to Pulse naturally',
    copy: 'You do not need rigid commands. Short follow-ups like "sent?", "save this", or "show me that one" now work with conversation context.',
    icon: ActivityIcon,
  },
  {
    title: 'Use Stream as your intake desk',
    copy: 'Open Stream to review parsed listings and requirements, apply filters, and decide what deserves a channel or a follow-up.',
    icon: SearchIcon,
  },
  {
    title: 'Trust the health panel',
    copy: 'Open WhatsApp Logs when you want proof that groups are connected, messages are flowing, and parsing is healthy.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Let channels organize the noise',
    copy: 'Create locality, budget, or urgency channels so Pulse sorts incoming signal into focused broker views automatically.',
    icon: WorkflowIcon,
  },
  {
    title: 'Use callbacks as your action queue',
    copy: 'Ask Pulse to show callbacks, prioritize hot leads, and keep follow-ups from going cold across the day.',
    icon: CallbackIcon,
  },
];

export const Docs: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[linear-gradient(180deg,rgba(13,17,23,0.98),rgba(9,13,18,0.98))] p-6 shadow-[0_0_0_1px_rgba(62,232,138,0.08),0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              <BookOpenIcon className="h-3.5 w-3.5" />
              PropAI Docs
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Everything Pulse can do for a broker workspace
            </h2>
            <p className="mt-3 max-w-2xl text-[14px] leading-7 text-[var(--text-secondary)]">
              PropAI now has enough surface area that brokers can miss useful capabilities. This page makes the product discoverable:
              AI agent tasks, Stream workflows, CRM memory, WhatsApp health, web tools, channels, and follow-up workflows.
            </p>
          </div>

          <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
            {[
              ['CRM memory', 'Listings, requirements, callbacks, and follow-up context'],
              ['Live intake', 'WhatsApp Business messages, parsed stream items, and health metrics'],
              ['Web tools', 'Fetch listings, search builders, verify RERA context'],
              ['Actions', 'Send messages, create channels, and prioritize next moves'],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {capabilitySections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.title}
              className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <Icon className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <button
                  type="button"
                  onClick={() => navigate(section.href)}
                  className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                >
                  Open
                </button>
              </div>

              <h3 className="mt-4 text-[16px] font-semibold text-[var(--text-primary)]">{section.title}</h3>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">{section.copy}</p>

              <div className="mt-4 space-y-2">
                {section.examples.map((example) => (
                  <div
                    key={example}
                    className="rounded-[8px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] leading-5 text-[var(--text-secondary)]"
                  >
                    {example}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">How to use Pulse well</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {howToUse.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.title}</p>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{item.copy}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Best prompts to try</p>
          <div className="mt-4 space-y-3">
            {[
              'Show my pending callback queue and tell me who I should call first.',
              'Create a channel for Bandra West rental listings and urgent buyer requirements.',
              'Search my CRM for 2BHK buyer requirements in Powai under 70k.',
              'Extract the structured details from this property URL: <paste link>',
              'Is my WhatsApp Business Cloud API connected right now?',
              'Show only broker-tagged messages from today in Stream.',
            ].map((prompt) => (
              <div key={prompt} className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[11px] leading-5 text-[var(--text-secondary)]">
                {prompt}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[linear-gradient(180deg,rgba(13,17,23,0.98),rgba(9,13,18,0.98))] p-6 shadow-[0_0_0_1px_rgba(62,232,138,0.08),0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              <BookOpenIcon className="h-3.5 w-3.5" />
              API Reference
            </div>
            <h3 className="mt-4 text-[24px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Backend routes currently exposed by PropAI
            </h3>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Base API host is your configured backend origin. In production this is typically the same domain used by the app, under `/api/...`.
              This is a live route reference for the current codebase, not a generated OpenAPI schema.
            </p>
          </div>

          <div className="min-w-[220px] rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Usage notes</p>
            <div className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--text-secondary)]">
              <p>Most routes require the same bearer session the app already uses.</p>
              <p>Path params like `:memberId` or `:id` are placeholders.</p>
              <p>Query and request-body shapes are validated in the backend route schemas.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {apiReferenceSections.map((section) => (
          <div key={section.title} className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{section.title}</p>
                <h4 className="mt-1 text-[16px] font-semibold text-[var(--text-primary)]">{section.base}</h4>
              </div>
              <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                {section.auth}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {section.endpoints.map((endpoint) => (
                <div
                  key={`${section.title}-${endpoint.method}-${endpoint.path}`}
                  className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                      {endpoint.method}
                    </span>
                    <code className="text-[12px] font-semibold text-[var(--text-primary)]">{endpoint.path}</code>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{endpoint.note}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
