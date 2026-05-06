import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { LoaderIcon, RefreshIcon, ShieldCheckIcon } from '../lib/icons';
import { useHistorySync } from '../hooks/useHistorySync';

export const HistorySyncBanner: React.FC = () => {
  const { isProcessing, progress, totalProcessed } = useHistorySync();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isProcessing && totalProcessed > 0) {
      const timer = window.setTimeout(() => setDismissed(true), 6000);
      return () => window.clearTimeout(timer);
    }

    setDismissed(false);
    return undefined;
  }, [isProcessing, totalProcessed]);

  if (dismissed || (!isProcessing && totalProcessed === 0)) {
    return null;
  }

  const progressWidth = typeof progress === 'number' ? `${Math.max(0, Math.min(100, progress))}%` : '35%';

  return (
    <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
          {isProcessing ? <LoaderIcon className="h-5 w-5 animate-spin text-[var(--accent)]" /> : <ShieldCheckIcon className="h-5 w-5 text-[var(--accent)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">History sync</p>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--text-primary)]">
            {isProcessing ? 'Importing WhatsApp history' : 'History import complete'}
          </h3>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            {isProcessing
              ? `The first-connection batch import is running in the background. ${totalProcessed} messages have already been processed.`
              : `Imported ${totalProcessed} historical messages into the AI memory layer.`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <div
            className={cn('h-full rounded-full bg-[var(--accent)] transition-all duration-300')}
            style={{ width: progressWidth }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <span>{isProcessing ? 'Syncing history' : 'Ready'}</span>
          <span>{typeof progress === 'number' ? `${Math.round(progress)}%` : '...'}</span>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
        Imported messages are fed back into the existing AI conversation memory, so future replies can use the historical context without retraining the model.
      </div>
    </div>
  );
};

