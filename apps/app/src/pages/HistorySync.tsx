import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HistorySyncBanner } from '../components/HistorySyncBanner';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { MessageSquareTextIcon, PlusIcon, LoaderIcon, CheckIcon, AlertTriangleIcon } from '../lib/icons';
import { useHistorySync } from '../hooks/useHistorySync';

type HistoryImportResponse = {
  success?: boolean;
  queued?: boolean;
  skipped?: boolean;
  reason?: string;
  fileName?: string | null;
  fileCount?: number;
  historyProcessedAt?: string | null;
  importId?: string | null;
};

type HistoryImportRecord = {
  id: string;
  workspace_id: string;
  filenames: string[];
  file_size_kb: number;
  status: 'queued' | 'parsing' | 'done' | 'failed';
  total_messages: number;
  parsed_listings: number;
  parsed_requirements: number;
  skipped_messages: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
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
  const [imports, setImports] = useState<HistoryImportRecord[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    filenames: string[];
    completedAt: string | null;
    listings: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImports = useCallback(async () => {
    try {
      const response = await backendApi.get<HistoryImportRecord[]>(ENDPOINTS.whatsapp.historyImports);
      setImports(Array.isArray(response.data) ? response.data : []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchImports();
    const interval = window.setInterval(fetchImports, 3000);
    return () => window.clearInterval(interval);
  }, [fetchImports]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setUploadMessage(null);
    setUploadError(null);
    setDuplicateWarning(null);

    if (!files.length) return;

    try {
      const filenames = files.map((f) => f.name);
      const response = await backendApi.post<{ alreadyImported: string[] }>(ENDPOINTS.whatsapp.historyCheckDuplicates, { filenames });
      const already = response.data?.alreadyImported || [];
      if (already.length > 0) {
        const doneImport = imports.find((imp) =>
          imp.status === 'done' && imp.filenames.some((name) => already.includes(name)),
        );
        setDuplicateWarning({
          filenames: already,
          completedAt: doneImport?.completed_at || null,
          listings: doneImport?.parsed_listings || 0,
        });
      }
    } catch {
      // non-blocking
    }
  }, [imports]);

  const handleUpload = useCallback(async (skipDuplicateCheck = false) => {
    if (!selectedFiles.length) {
      setUploadError('Choose at least one TXT export first.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    setDuplicateWarning(null);

    try {
      const files = await Promise.all(selectedFiles.map(async (file) => ({
        fileName: file.name,
        content: await file.text(),
      })));
      const response = await backendApi.post<HistoryImportResponse>(ENDPOINTS.whatsapp.historyImport, {
        files,
        forceProcess: forceProcess || skipDuplicateCheck,
      });
      const payload = response.data || {};

      if (payload.skipped && payload.reason === 'already_processed') {
        const completedAt = payload.historyProcessedAt || historyProcessedAt;
        setUploadMessage(completedAt
          ? `History import was already completed on ${new Date(completedAt).toLocaleString()}. Turn on Re-import to process these files again.`
          : 'History import was already completed earlier. Turn on Re-import to process these files again.');
      } else {
        setUploadMessage(forceProcess || skipDuplicateCheck
          ? `Re-import queued for ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}.`
          : `Queued ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} for background parsing.`);
      }
      setSelectedFiles([]);
      setForceProcess(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void fetchImports();
    } catch (error) {
      setUploadError(handleApiError(error));
    } finally {
      setIsUploading(false);
    }
  }, [forceProcess, historyProcessedAt, selectedFiles, fetchImports]);

  const totalSelectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const selectedCount = selectedFiles.length;
  const visibleTotal = Math.max(totalSource, totalProcessed);
  const parsingImports = imports.filter((imp) => imp.status === 'parsing');
  const doneImports = imports.filter((imp) => imp.status === 'done');
  const failedImports = imports.filter((imp) => imp.status === 'failed');
  const queuedImports = imports.filter((imp) => imp.status === 'queued');

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

        {duplicateWarning ? (
          <div className="mt-3 rounded-[14px] border border-[color:rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[var(--amber)]">Already imported</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                  {duplicateWarning.filenames.join(', ')} {duplicateWarning.filenames.length === 1 ? 'was' : 'were'} imported on{' '}
                  {duplicateWarning.completedAt ? new Date(duplicateWarning.completedAt).toLocaleString() : 'a previous date'}
                  {duplicateWarning.listings > 0 ? ` — ${duplicateWarning.listings} listings extracted.` : '.'}
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleUpload(true)}
                    disabled={isUploading}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-colors hover:brightness-95 disabled:opacity-50"
                  >
                    {isUploading ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : null}
                    Import again
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDuplicateWarning(null); setSelectedFiles([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
          The upload runs in the background. You can leave this page open while the Import History section below shows live progress. The request ceiling is now 25 MB total per import request, which is usually enough for several normal TXT exports but not huge archive dumps.
        </div>
      </div>

      <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquareTextIcon className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Import History</h2>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {imports.length} import{imports.length === 1 ? '' : 's'} · {doneImports.length} done · {parsingImports.length} in progress
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchImports()}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <LoaderIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {imports.length === 0 ? (
          <div className="mt-4 rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-6 text-center text-[13px] text-[var(--text-secondary)]">
            No imports yet. Upload a TXT file above to get started.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {imports.map((imp) => (
              <div key={imp.id} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                      {imp.filenames.join(', ')}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                      {formatBytes(imp.file_size_kb * 1024)}
                      {imp.started_at ? ` · Started ${new Date(imp.started_at).toLocaleString()}` : ''}
                      {imp.completed_at ? ` · ${new Date(imp.completed_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={imp.status} errorMessage={imp.error_message} />
                </div>

                {imp.status === 'parsing' ? (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-base)]">
                      <div
                        className="h-full animate-pulse rounded-full bg-[var(--accent)] transition-all duration-500"
                        style={{
                          width: imp.total_messages > 0
                            ? `${Math.min(95, Math.round((imp.parsed_listings + imp.parsed_requirements + imp.skipped_messages) / Math.max(1, imp.total_messages) * 100))}%`
                            : '15%',
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                      Parsing... {imp.parsed_listings + imp.parsed_requirements + imp.skipped_messages} of {imp.total_messages || '?'} messages processed
                      {imp.parsed_listings > 0 ? ` · ${imp.parsed_listings} listings` : ''}
                      {imp.parsed_requirements > 0 ? ` · ${imp.parsed_requirements} requirements` : ''}
                    </p>
                  </div>
                ) : imp.status === 'done' ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Messages</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[var(--text-primary)]">{imp.total_messages}</p>
                    </div>
                    <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Listings</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[var(--text-primary)]">{imp.parsed_listings}</p>
                    </div>
                    <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Requirements</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[var(--text-primary)]">{imp.parsed_requirements}</p>
                    </div>
                    <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Skipped</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[var(--text-primary)]">{imp.skipped_messages}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
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

function StatusBadge({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]';

  switch (status) {
    case 'queued':
      return <span className={`${base} bg-[var(--bg-base)] text-[var(--text-muted)]`}>Queued</span>;
    case 'parsing':
      return (
        <span className={`${base} bg-[rgba(245,158,11,0.12)] text-[var(--amber)]`}>
          <LoaderIcon className="h-3 w-3 animate-spin" />
          Parsing
        </span>
      );
    case 'done':
      return <span className={`${base} bg-[rgba(37,211,102,0.12)] text-[var(--accent)]`}>&#10003; Done</span>;
    case 'failed':
      return (
        <span
          className={`${base} bg-[rgba(239,68,68,0.1)] text-[var(--red)] cursor-help`}
          title={errorMessage || 'Import failed'}
        >
          &#10007; Failed
        </span>
      );
    default:
      return <span className={`${base} bg-[var(--bg-base)] text-[var(--text-muted)]`}>{status}</span>;
  }
}

function InfoCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{copy}</p>
    </div>
  );
}
