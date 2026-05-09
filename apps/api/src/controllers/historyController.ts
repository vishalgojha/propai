import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { historyTextImportService } from '../services/historyTextImportService';

function getTenantId(req: Request) {
  const user = (req as any).user;
  return String(user?.id || 'system');
}

const db = supabaseAdmin ?? supabase;

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

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    if (profile?.history_processed) {
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

  setImmediate(() => {
    const importPromise = importFiles.length > 1
      ? historyTextImportService.importManyTxt({
        tenantId,
        files: importFiles,
        sessionLabel: label,
        forceProcess: force,
      })
      : historyTextImportService.importTxt({
        tenantId,
        rawText: String(importFiles[0]?.content || ''),
        fileName: importFiles[0]?.fileName || name,
        sessionLabel: label,
        forceProcess: force,
      });

    void importPromise.catch((error) => {
      console.error('[HistoryController] Failed to import TXT history', {
        tenantId,
        fileName: name,
        fileCount: importFiles.length,
        sessionLabel: label,
        forceProcess: force,
        error,
      });
    });
  });

  return res.status(202).json({
    success: true,
    queued: true,
    fileName: importFiles.length === 1 ? importFiles[0]?.fileName || name : null,
    fileCount: importFiles.length,
    forceProcess: force,
  });
};
