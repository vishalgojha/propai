import { Request, Response } from 'express';
import { historyTextImportService } from '../services/historyTextImportService';

function getTenantId(req: Request) {
  const user = (req as any).user;
  return String(user?.id || 'system');
}

export const importHistoryTxt = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { content, fileName, sessionLabel, forceProcess } = req.body || {};

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'TXT content is required' });
  }

  const name = typeof fileName === 'string' ? fileName.trim() : null;
  const label = typeof sessionLabel === 'string' ? sessionLabel.trim() : null;
  const force = typeof forceProcess === 'boolean' ? forceProcess : false;

  setImmediate(() => {
    void historyTextImportService.importTxt({
      tenantId,
      rawText: content,
      fileName: name,
      sessionLabel: label,
      forceProcess: force,
    }).catch((error) => {
      console.error('[HistoryController] Failed to import TXT history', {
        tenantId,
        fileName: name,
        sessionLabel: label,
        forceProcess: force,
        error,
      });
    });
  });

  return res.status(202).json({
    success: true,
    queued: true,
    fileName: name,
    forceProcess: force,
  });
};
