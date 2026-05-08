import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';
import { workspaceAccessService } from '../services/workspaceAccessService';

const db = supabaseAdmin ?? supabase;
const DEFAULT_BUCKET = 'workspace-files';
const MAX_BASE64_BYTES = 6 * 1024 * 1024; // ~6MB raw (before base64 overhead)
const MAX_EXTRACTED_TEXT_CHARS = 120_000;
const MAX_PDF_BYTES = 12 * 1024 * 1024; // PDFs can be larger; still keep bounded.
const MAX_OCR_BYTES = 6 * 1024 * 1024;

function normalizeFilename(value: string) {
  const trimmed = String(value || '').trim() || 'attachment';
  return trimmed.slice(0, 180);
}

function safeMime(value: unknown) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 120) : 'application/octet-stream';
}

function decodeBase64Payload(payload: string) {
  const cleaned = payload.includes(',') ? payload.slice(payload.indexOf(',') + 1) : payload;
  const buffer = Buffer.from(cleaned, 'base64');
  return buffer;
}

function sniffText(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}

async function extractPdfText(buffer: Buffer) {
  try {
    // pdf-parse is optional at runtime; avoid hard crash if not installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    const text = String(result?.text || '').trim();
    if (!text) return null;
    return text.length > MAX_EXTRACTED_TEXT_CHARS ? `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[Truncated]` : text;
  } catch {
    return null;
  }
}

async function extractImageTextViaOcr(buffer: Buffer) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const result = await worker.recognize(buffer);
      const text = String(result?.data?.text || '').trim();
      if (!text) return null;
      return text.length > MAX_EXTRACTED_TEXT_CHARS ? `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[Truncated]` : text;
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function extractTextIfSupported(buffer: Buffer, mimeType: string, fileName: string) {
  const lower = fileName.toLowerCase();
  const isTextLike =
    mimeType.startsWith('text/') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.md') ||
    lower.endsWith('.json');

  const isPdf = mimeType === 'application/pdf' || lower.endsWith('.pdf');

  if (isPdf) {
    return await extractPdfText(buffer);
  }

  const isImage = mimeType.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp|tiff)$/.test(lower);
  if (isImage) {
    if (buffer.length > MAX_OCR_BYTES) return null;
    return await extractImageTextViaOcr(buffer);
  }

  if (!isTextLike) return null;
  if (!sniffText(buffer)) return null;
  const text = buffer.toString('utf8');
  return text.length > MAX_EXTRACTED_TEXT_CHARS ? `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[Truncated]` : text;
}

async function ensureBucket(bucket = DEFAULT_BUCKET) {
  if (!supabaseAdmin) {
    return { ok: false, reason: 'storage_admin_unavailable' as const };
  }

  try {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) {
      return { ok: false, reason: listError.message as const };
    }

    if (Array.isArray(buckets) && buckets.some((b) => b.name === bucket)) {
      return { ok: true as const };
    }

    const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, { public: false });
    if (createError) {
      return { ok: false, reason: createError.message as const };
    }

    return { ok: true as const };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'bucket_error' as const };
  }
}

export const uploadWorkspaceFile = async (req: Request, res: Response) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user);
    const workspaceId = context.workspaceOwnerId;
    const fileName = normalizeFilename(req.body?.fileName);
    const mimeType = safeMime(req.body?.mimeType);
    const base64 = String(req.body?.base64 || '').trim();

    if (!base64) {
      return res.status(400).json({ error: 'base64 is required' });
    }

    const buffer = decodeBase64Payload(base64);
    if (!buffer.length) {
      return res.status(400).json({ error: 'Empty payload' });
    }
    if (buffer.length > MAX_BASE64_BYTES) {
      return res.status(413).json({ error: 'File too large for inline upload. Please upload a smaller file.' });
    }

    const bucketCheck = await ensureBucket(DEFAULT_BUCKET);
    if (!bucketCheck.ok) {
      return res.status(503).json({ error: 'File storage is not available on this deployment yet.' });
    }

    const ext = (() => {
      const dot = fileName.lastIndexOf('.');
      return dot > -1 ? fileName.slice(dot).toLowerCase().slice(0, 12) : '';
    })();
    const fileId = crypto.randomUUID();
    const storagePath = `${workspaceId}/${new Date().toISOString().slice(0, 10)}/${fileId}${ext}`;

    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    if (isPdf && buffer.length > MAX_PDF_BYTES) {
      return res.status(413).json({ error: 'PDF is too large to extract text safely. Please upload a smaller PDF or export a TXT/CSV.' });
    }

    let extractionStatus: 'pending' | 'extracted' | 'not_supported' | 'failed' = 'pending';
    let extractionError: string | null = null;
    let extractedText: string | null = null;

    try {
      extractedText = await extractTextIfSupported(buffer, mimeType, fileName);
      extractionStatus = extractedText && extractedText.trim() ? 'extracted' : 'not_supported';
    } catch (err: any) {
      extractionStatus = 'failed';
      extractionError = String(err?.message || 'extraction_failed');
      extractedText = null;
    }

    const { error: uploadError } = await supabaseAdmin!.storage
      .from(DEFAULT_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message || 'Failed to upload file' });
    }

    const now = new Date().toISOString();
    const { data: row, error: insertError } = await db
      .from('workspace_files')
      .insert({
        workspace_id: workspaceId,
        file_name: fileName,
        mime_type: mimeType,
        byte_size: buffer.length,
        storage_bucket: DEFAULT_BUCKET,
        storage_path: storagePath,
        extracted_text: extractedText,
        extraction_status: extractionStatus,
        extraction_error: extractionError,
        created_at: now,
        updated_at: now,
      })
      .select('id, file_name, mime_type, byte_size, storage_bucket, storage_path, extracted_text, extraction_status, extraction_error, created_at')
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message || 'Failed to save file metadata' });
    }

    return res.json({
      success: true,
      file: {
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        bucket: row.storage_bucket,
        path: row.storage_path,
        extractedText: row.extracted_text || null,
        extractionStatus: row.extraction_status || null,
        extractionError: row.extraction_error || null,
        createdAt: row.created_at,
      },
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to upload file' });
  }
};

export const listWorkspaceFiles = async (req: Request, res: Response) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user);
    const workspaceId = context.workspaceOwnerId;
    const limit = Math.max(10, Math.min(200, Number(req.query.limit || 40)));

    const { data, error } = await db
      .from('workspace_files')
      .select('id, file_name, mime_type, byte_size, extraction_status, extraction_error, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to list files' });
    }

    res.json({
      success: true,
      files: (data || []).map((row: any) => ({
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type || null,
        byteSize: Number(row.byte_size || 0),
        extractionStatus: row.extraction_status || null,
        extractionError: row.extraction_error || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to list files' });
  }
};

export const getWorkspaceFileText = async (req: Request, res: Response) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user);
    const workspaceId = context.workspaceOwnerId;
    const fileId = String(req.params.fileId || '').trim();
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const { data, error } = await db
      .from('workspace_files')
      .select('id, file_name, extracted_text, extraction_status, extraction_error, mime_type, byte_size, created_at')
      .eq('workspace_id', workspaceId)
      .eq('id', fileId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to load file' });
    }

    if (!data) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      success: true,
      file: {
        id: data.id,
        fileName: data.file_name,
        mimeType: data.mime_type || null,
        byteSize: Number(data.byte_size || 0),
        createdAt: data.created_at,
        extractedText: data.extracted_text || null,
        extractionStatus: data.extraction_status || null,
        extractionError: data.extraction_error || null,
      },
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load file' });
  }
};
