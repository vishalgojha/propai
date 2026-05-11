import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type ImportRow = {
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

type ProgressData = {
  total: number;
  processed: number;
  listings: number;
  leads: number;
  parsed: number;
  skipped: number;
  failed: number;
};

export class HistoryImportTrackingService {
  async createImport(workspaceId: string, filenames: string[], fileSizeKb: number): Promise<string> {
    const { data, error } = await db
      .from('history_imports')
      .insert({
        workspace_id: workspaceId,
        filenames: JSON.stringify(filenames),
        file_size_kb: fileSizeKb,
        status: 'queued',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[HistoryImportTrackingService] Failed to create import', { workspaceId, error });
      throw new Error(error.message || 'Failed to create import record');
    }

    return data.id;
  }

  async markParsing(id: string): Promise<void> {
    const { error } = await db
      .from('history_imports')
      .update({
        status: 'parsing',
        started_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[HistoryImportTrackingService] Failed to mark parsing', { id, error });
    }
  }

  async updateProgress(id: string, progress: ProgressData): Promise<void> {
    const { error } = await db
      .from('history_imports')
      .update({
        total_messages: progress.total,
        parsed_listings: progress.listings,
        parsed_requirements: progress.leads,
        skipped_messages: progress.skipped,
      })
      .eq('id', id);

    if (error) {
      console.error('[HistoryImportTrackingService] Failed to update progress', { id, error });
    }
  }

  async markDone(id: string, progress: ProgressData): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await db
      .from('history_imports')
      .update({
        status: 'done',
        total_messages: progress.total,
        parsed_listings: progress.listings,
        parsed_requirements: progress.leads,
        skipped_messages: progress.skipped,
        completed_at: now,
      })
      .eq('id', id);

    if (error) {
      console.error('[HistoryImportTrackingService] Failed to mark done', { id, error });
    }
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await db
      .from('history_imports')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: now,
      })
      .eq('id', id);

    if (error) {
      console.error('[HistoryImportTrackingService] Failed to mark failed', { id, error });
    }
  }

  async getImports(workspaceId: string): Promise<ImportRow[]> {
    const { data, error } = await db
      .from('history_imports')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[HistoryImportTrackingService] Failed to get imports', { workspaceId, error });
      return [];
    }

    return ((data || []) as any[]).map((row) => ({
      ...row,
      filenames: typeof row.filenames === 'string'
        ? JSON.parse(row.filenames)
        : Array.isArray(row.filenames)
          ? row.filenames
          : [],
    }));
  }

  async getAlreadyImportedFilenames(workspaceId: string, filenames: string[]): Promise<string[]> {
    if (!filenames.length) return [];

    const { data, error } = await db
      .from('history_imports')
      .select('filenames')
      .eq('workspace_id', workspaceId)
      .in('status', ['done']);

    if (error || !data?.length) return [];

    const importedSet = new Set<string>();
    for (const row of data) {
      const stored: string[] = typeof row.filenames === 'string'
        ? JSON.parse(row.filenames)
        : Array.isArray(row.filenames)
          ? row.filenames
          : [];

      for (const name of stored) {
        importedSet.add(name);
      }
    }

    return filenames.filter((name) => importedSet.has(name));
  }
}

export const historyImportTrackingService = new HistoryImportTrackingService();
