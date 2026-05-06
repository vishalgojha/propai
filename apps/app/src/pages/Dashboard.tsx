import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap } from 'lucide-react';

const EmptyState: React.FC = () => {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-5xl flex-col justify-center space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-6 md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
              <Zap className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Your workspace is live</p>
              <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Good to have you, partner.</h2>
            </div>
          </div>

          <p className="mt-5 max-w-xl text-[13px] leading-6 text-[var(--text-secondary)]">
            Connect your WhatsApp number and Pulse starts working immediately — reading group messages, scoring listings, flagging requirements, and keeping your follow-up queue moving.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ['Never miss a listing', 'Every property you hear about, captured before the group scrolls past it.'],
              ['Follow up at the right time', 'Pulse flags hot leads and reminds you who to call next — no spreadsheet needed.'],
              ['Find matches instantly', "Describe what the buyer wants. Pulse searches your full inventory and returns the right unit."],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{copy}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
            Your workspace is secured and ready to receive WhatsApp data.
          </div>
        </div>

        <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-6 md:p-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">3 steps to your first deal</p>
          <div className="mt-3 space-y-4">
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] font-medium text-[var(--text-primary)]">1. Connect your WhatsApp</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Go to Sources, scan the QR, and Pulse starts reading your group messages automatically.</p>
            </div>
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] font-medium text-[var(--text-primary)]">2. Tell Pulse what you heard</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Message the agent: "3BHK Bandra West 1.8Cr sale" — Pulse files it, scores it, and routes the match.</p>
            </div>
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] font-medium text-[var(--text-primary)]">3. Close your first deal</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Check matched requirements, pending follow-ups, and hot leads — all in one place, ranked by urgency.</p>
            </div>
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-2 rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] px-5 py-4 text-[12px] text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between"
      >
        <span>Connect WhatsApp in the Sources page to activate live group message parsing.</span>
        <span className="text-[var(--text-primary)]">Workspace ready</span>
      </motion.div>
    </div>
  );
};


export const Dashboard: React.FC = () => {
  const hasData = false;

  if (!hasData) {
    return <EmptyState />;
  }

  return (
    <div className="text-center text-[var(--text-secondary)]">
      Dashboard data will appear here once the workspace is populated.
    </div>
  );
};
