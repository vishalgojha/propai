import React, { useCallback, useState } from 'react';
import { HistorySyncBanner } from '../components/HistorySyncBanner';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { MessageSquareTextIcon, ShieldCheckIcon, PlusIcon, LoaderIcon, CheckIcon } from '../lib/icons';

export const HistorySync: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [forceProcess, setForceProcess] = useState(false);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadMessage(null);
    setUploadError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setUploadError('Choose a TXT export first.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      const content = await selectedFile.text();
      await backendApi.post(ENDPOINTS.whatsapp.historyImport, {
        fileName: selectedFile.name,
        content,
        forceProcess,
      });

      setUploadMessage(forceProcess
        ? `Re-import queued: ${selectedFile.name}.`
        : `Queued ${selectedFile.name} for background parsing.`);
      setSelectedFile(null);
      setForceProcess(false);
    } catch (error) {
      setUploadError(handleApiError(error));
    } finally {
      setIsUploading(false);
    }
  }, [forceProcess, selectedFile]);

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
          <PlusIcon className="mt-0.5 h-5 w-5 text-[var(--accent)]" />
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Attach WhatsApp TXT export</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Upload a WhatsApp chat export `.txt` file. PropAI will parse it with the same stream logic, push extracted listings and requirements into Stream, and seed AI memory for that workspace.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">TXT file</span>
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileChange}
              className="mt-2 block w-full cursor-pointer rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-[12px] file:font-medium file:text-white"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={!selectedFile || isUploading}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-4 py-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
            {isUploading ? 'Uploading' : forceProcess ? 'Re-import TXT' : 'Import TXT'}
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

        {selectedFile ? (
          <p className="mt-3 text-[12px] text-[var(--text-secondary)]">Selected: {selectedFile.name}</p>
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
          The upload runs in the background. You can leave this page open while the History Sync banner shows progress.
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
