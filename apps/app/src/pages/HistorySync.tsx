import React, { useCallback, useState } from 'react';
import { HistorySyncBanner } from '../components/HistorySyncBanner';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { MessageSquareTextIcon, PlusIcon, LoaderIcon, CheckIcon } from '../lib/icons';
import { useHistorySync } from '../hooks/useHistorySync';

type HistoryImportResponse = {
  success?: boolean;
  queued?: boolean;
  skipped?: boolean;
  reason?: string;
  fileName?: string | null;
  fileCount?: number;
  historyProcessedAt?: string | null;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

export const HistorySync: React.FC = () => {
  const { totalProcessed, totalSource, historyProcessedAt, result } = useHistorySync();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [forceProcess, setForceProcess] = useState(false);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setUploadMessage(null);
    setUploadError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFiles.length) {
      setUploadError('Choose at least one TXT export first.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      const files = await Promise.all(selectedFiles.map(async (file) => ({
        fileName: file.name,
        content: await file.text(),
      })));
      const response = await backendApi.post<HistoryImportResponse>(ENDPOINTS.whatsapp.historyImport, {
        files,
        forceProcess,
      });
      const payload = response.data || {};

      if (payload.skipped && payload.reason === 'already_processed') {
        const completedAt = payload.historyProcessedAt || historyProcessedAt;
        setUploadMessage(completedAt
          ? `History import was already completed on ${new Date(completedAt).toLocaleString()}. Turn on Re-import to process these files again.`
          : 'History import was already completed earlier. Turn on Re-import to process these files again.');
      } else {
        setUploadMessage(forceProcess
          ? `Re-import queued for ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}.`
          : `Queued ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} for background parsing.`);
      }
      setSelectedFiles([]);
      setForceProcess(false);
    } catch (error) {
      setUploadError(handleApiError(error));
    } finally {
      setIsUploading(false);
    }
  }, [forceProcess, historyProcessedAt, selectedFiles]);

  const totalSelectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const selectedCount = selectedFiles.length;
  const visibleTotal = Math.max(totalSource, totalProcessed);

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

      {result ? (
        <div className="rounded-[18px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-5">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">Import results</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{result.listings}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Listings found</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{result.leads}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Requirements found</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{result.parsed}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Extracted items</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-red, #ef4444)]">{result.failed}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Failed to parse</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <a
              href="/stream"
              className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--accent)] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:opacity-90"
            >
              View in Stream
            </a>
            <p className="self-center text-[11px] text-[var(--text-secondary)]">
              Processed {result.processed} of {result.total} messages{result.skipped > 0 ? ` · ${result.skipped} skipped` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <InfoCard
          title="Current progress"
          copy={visibleTotal > 0 ? `${totalProcessed} of ${visibleTotal} history messages processed.` : 'No history import has started for this workspace yet.'}
        />
        <InfoCard
          title="Stream behavior"
          copy="Only parsed listings and requirements land in Stream. Other imported messages still feed memory and assistant context."
        />
        <InfoCard
          title="Storage model"
          copy="The original TXT files are not stored as files. They are parsed in memory; only derived messages, counters, Stream items, and memory records persist."
        />
      </div>

      <div className="rounded-[18px] border border-dashed border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex items-start gap-3">
          <PlusIcon className="mt-0.5 h-5 w-5 text-[var(--accent)]" />
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Attach WhatsApp TXT export</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Upload one or more WhatsApp chat export `.txt` files. PropAI will parse them with the same stream logic, push extracted listings and requirements into Stream, and seed AI memory for that workspace.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">TXT file</span>
            <input
              type="file"
              multiple
              accept=".txt,text/plain"
              onChange={handleFileChange}
              className="mt-2 block w-full cursor-pointer rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-[12px] file:font-medium file:text-white"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={!selectedFiles.length || isUploading}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-4 py-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
            {isUploading ? 'Uploading' : forceProcess ? 'Re-import TXT files' : 'Import TXT files'}
          </button>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-[12px] border border-[color:rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={forceProcess}
            onChange={(event) => setForceProcess(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[color:var(--border-strong)] bg-[var(--bg-base)] text-[var(--accent)] accent-[var(--accent)]"
          />
          <span>
            Re-import (danger): resets history import progress and reprocesses the TXT. Leave this off for one-time onboarding.
          </span>
        </label>

        {selectedFiles.length ? (
          <div className="mt-3 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
            <p className="text-[12px] font-medium text-[var(--text-primary)]">
              Selected {selectedCount} file{selectedCount === 1 ? '' : 's'} · {formatBytes(totalSelectedBytes)}
            </p>
            <div className="mt-2 space-y-1 text-[12px] text-[var(--text-secondary)]">
              {selectedFiles.map((file) => (
                <p key={`${file.name}-${file.size}-${file.lastModified}`}>
                  {file.name} · {formatBytes(file.size)}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {uploadMessage ? (
          <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[13px] text-[var(--text-primary)]">
            <CheckIcon className="h-4 w-4 text-[var(--accent)]" />
            <span>{uploadMessage}</span>
          </div>
        ) : null}

        {uploadError ? (
          <div className="mt-4 rounded-[12px] border border-[color:var(--red-border)] bg-[var(--red-dim)] px-4 py-3 text-[13px] text-[var(--text-primary)]">
            {uploadError}
          </div>
        ) : null}

        <div className="mt-4 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
          The upload runs in the background. You can leave this page open while the History Sync banner shows progress. The request ceiling is now 25 MB total per import request, which is usually enough for several normal TXT exports but not huge archive dumps.
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
