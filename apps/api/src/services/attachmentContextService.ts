import { supabase, supabaseAdmin } from '../config/supabase';

export type AttachmentInfo = string | { fileId?: string };

export async function buildAttachmentContext(tenantId: string, attachments: AttachmentInfo[]): Promise<string> {
    const ids = attachments
        .map((item) => (typeof item === 'string' ? item : item?.fileId))
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .slice(0, 6);

    if (ids.length === 0) return '';

    const client = supabaseAdmin ?? supabase;
    const { data, error } = await client
        .from('workspace_files')
        .select('id, file_name, mime_type, extracted_text, extraction_status, extraction_error')
        .eq('workspace_id', tenantId)
        .in('id', ids);

    if (error || !Array.isArray(data) || data.length === 0) {
        return '';
    }

    const parts: string[] = [];
    for (const row of data) {
        const r = row as { file_name?: string | null; mime_type?: string | null; extracted_text?: string | null; extraction_status?: string | null; extraction_error?: string | null };
        const name = String(r.file_name || 'attachment');
        const mime = String(r.mime_type || '');
        const text = String(r.extracted_text || '').trim();
        const status = String(r.extraction_status || '');
        const extractionError = String(r.extraction_error || '').trim();
        if (!text) {
            if (status === 'failed') {
                parts.push(`[${name}${mime ? ` (${mime})` : ''}] OCR/text extraction failed${extractionError ? `: ${extractionError}` : '.'} If this is a scanned PDF/image, try a clearer file or paste the key text.`);
            } else {
                parts.push(`[${name}${mime ? ` (${mime})` : ''}] No text extracted. If this is a scanned PDF/image and OCR is not enabled on this deployment, the model cannot read it. Please paste the key text or upload a text-based PDF/TXT.`);
            }
            continue;
        }
        const clipped = text.length > 30_000 ? `${text.slice(0, 30_000)}\n\n[Truncated]` : text;
        parts.push(`[${name}${mime ? ` (${mime})` : ''}]\n${clipped}`);
    }

    return parts.join('\n\n');
}
