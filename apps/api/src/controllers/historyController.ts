import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { historyTextImportService } from '../services/historyTextImportService';
import { historyImportTrackingService } from '../services/historyImportTrackingService';
import { getErrorMessage } from '../utils/controllerHelpers';
import '../types/express';

function getTenantId(req: Request) {
  if (!req.user) return 'system';
  return req.user.id;
}

const db = supabaseAdmin ?? supabase;

function isMissingHistoryProfileColumnError(error: unknown) {
  const message = String(error instanceof Error ? error.message : '').toLowerCase();
  return message.includes('history_processed') || message.includes('history_processed_at') || message.includes('history_message_count') || message.includes('history_total_count') || message.includes('history_import_result');
}

type HistoryImportFile = {
  fileName?: string | null;
  content?: string | null;
};

export const importHistoryTxt = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { content, fileName, sessionLabel, forceProcess, files } = req.body || {};

  const normalizedFiles = Array.isArray(files)
    ? files
      .map((entry) => ({
        fileName: typeof (entry as HistoryImportFile)?.fileName === 'string' ? (entry as HistoryImportFile).fileName?.trim() || null : null,
        content: typeof (entry as HistoryImportFile)?.content === 'string' ? (entry as HistoryImportFile).content || null : null,
      }))
      .filter((entry) => typeof entry.content === 'string' && entry.content.trim().length > 0)
    : [];

  if (!normalizedFiles.length && (typeof content !== 'string' || !content.trim())) {
    return res.status(400).json({ error: 'TXT content is required' });
  }

  const name = typeof fileName === 'string' ? fileName.trim() : null;
  const label = typeof sessionLabel === 'string' ? sessionLabel.trim() : null;
  const force = typeof forceProcess === 'boolean' ? forceProcess : false;
  const importFiles = normalizedFiles.length
    ? normalizedFiles
    : [{ fileName: name, content }];

  if (!force) {
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('history_processed, history_processed_at')
      .eq('id', tenantId)
      .maybeSingle();

    if (profileError && !isMissingHistoryProfileColumnError(profileError)) {
      return res.status(500).json({ error: profileError.message });
    }

    if (!profileError && profile?.history_processed) {
      return res.status(200).json({
        success: true,
        queued: false,
        skipped: true,
        reason: 'already_processed',
        fileCount: importFiles.length,
        historyProcessedAt: profile.history_processed_at || null,
      });
    }
  }

  const fileNames = importFiles.map((f) => f.fileName || 'unknown.txt').filter(Boolean);
  const totalBytes = importFiles.reduce((sum, f) => sum + (f.content?.length || 0), 0);
  const fileSizeKb = Math.round(totalBytes / 1024);

  let importId: string | null = null;
  try {
    importId = await historyImportTrackingService.createImport(tenantId, fileNames, fileSizeKb);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error, 'Failed to track import') });
  }

  const capturedId = importId;

  setImmediate(() => {
    const onProgress = (progress: { total: number; processed: number; listings: number; leads: number; parsed: number; skipped: number; failed: number }) => {
      void historyImportTrackingService.updateProgress(capturedId, progress);
    };

    const executeImport = async () => {
      await historyImportTrackingService.markParsing(capturedId);

      try {
        const result = importFiles.length > 1
          ? await historyTextImportService.importManyTxt({
              tenantId,
              files: importFiles,
              sessionLabel: label,
              forceProcess: force,
              onProgress,
            })
          : await historyTextImportService.importTxt({
              tenantId,
              rawText: String(importFiles[0]?.content || ''),
              fileName: importFiles[0]?.fileName || name,
              sessionLabel: label,
              forceProcess: force,
              onProgress,
            });

        await historyImportTrackingService.markDone(capturedId, {
          total: result.total,
          processed: result.processed,
          listings: result.listings,
          leads: result.leads,
          parsed: result.parsed,
          skipped: result.skipped,
          failed: result.failed,
        });
      } catch (error) {
        const message = getErrorMessage(error, 'Import failed');
        console.error('[HistoryController] Failed to import TXT history', {
          tenantId,
          fileName: name,
          fileCount: importFiles.length,
          sessionLabel: label,
          forceProcess: force,
          error,
        });
        await historyImportTrackingService.markFailed(capturedId, message);
      }
    };

    void executeImport();
  });

  return res.status(202).json({
    success: true,
    queued: true,
    importId,
    fileName: importFiles.length === 1 ? importFiles[0]?.fileName || name : null,
    fileCount: importFiles.length,
    forceProcess: force,
  });
};

export const getHistoryImports = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  try {
    const imports = await historyImportTrackingService.getImports(tenantId);
    res.json(imports);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to load import history') });
  }
};

export const checkDuplicateImports = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { filenames } = req.body || {};

  if (!Array.isArray(filenames) || filenames.length === 0) {
    return res.status(400).json({ error: 'filenames array is required' });
  }

  try {
    const alreadyImported = await historyImportTrackingService.getAlreadyImportedFilenames(tenantId, filenames);
    res.json({ alreadyImported });
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to check duplicates') });
  }
};
