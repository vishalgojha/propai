import React from 'react';
import { HistorySyncBanner } from '../components/HistorySyncBanner';
import { MessageSquareTextIcon, ShieldCheckIcon } from '../lib/icons';

export const HistorySync: React.FC = () => {
  return (
    <div className="space-y-6">
      <HistorySyncBanner />

      <div className="grid gap-3 md:grid-cols-3">
        <InfoCard
          title="One-time import"
          copy="The batch processor checks the profile flag before running, so the history load only happens once per workspace."
        />
        <InfoCard
          title="Parsing reused"
          copy="Historical messages are filtered and then passed through the same stream parsing path already used for live messages."
        />
        <InfoCard
          title="Output state"
          copy="When the import finishes, the profile records how many history messages were processed and when it completed."
        />
      </div>

      <div className="rounded-[18px] border border-dashed border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="mt-0.5 h-5 w-5 text-[var(--accent)]" />
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Pending wiring</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--text-secondary)]">
              The live banner is now connected. The remaining work is to surface the same state in the WhatsApp setup area and the setup notifications so operators see it immediately after QR connect.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex items-center gap-3">
          <MessageSquareTextIcon className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">What it will import</h2>
        </div>
        <p className="mt-3 max-w-3xl text-[13px] leading-6 text-[var(--text-secondary)]">
          The history processor is intended for real WhatsApp chat history, not connection logs. It skips media, calls, and system messages and keeps the import strictly asynchronous.
        </p>
      </div>
    </div>
  );
};

function InfoCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{copy}</p>
    </div>
  );
}
