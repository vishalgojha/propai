import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';

type ExportFormat = 'csv' | 'excel' | 'pdf';
type ExportDataset = 'listings' | 'requirements' | 'crm' | 'followups';

type ExportRequest = {
    dataset: ExportDataset;
    format: ExportFormat;
    prompt: string;
};

type ExportRecord = Record<string, string | number | null>;

const EXPORT_DIR = path.join(process.cwd(), 'data', 'exports');

function getClient() {
    return supabaseAdmin ?? supabase;
}

function sanitizeCell(value: unknown) {
    if (value == null) return '';
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
    return JSON.stringify(value);
}

function csvEscape(value: unknown) {
    const str = String(sanitizeCell(value));
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function xmlEscape(value: unknown) {
    return String(sanitizeCell(value))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function pdfEscape(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function inferFormat(prompt: string): ExportFormat {
    const text = prompt.toLowerCase();
    if (text.includes('pdf')) return 'pdf';
    if (text.includes('excel') || text.includes('xlsx') || text.includes('xls') || text.includes('spreadsheet')) return 'excel';
    return 'csv';
}

function inferDataset(prompt: string): ExportDataset {
    const text = prompt.toLowerCase();
    if (text.includes('follow-up') || text.includes('follow up') || text.includes('callback') || text.includes('queue')) return 'followups';
    if (text.includes('requirement')) return 'requirements';
    if (text.includes('crm')) return 'crm';
    return 'listings';
}

function titleCase(value: string) {
    return value
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function buildCsv(records: ExportRecord[]) {
    if (!records.length) {
        return 'No data available\n';
    }

    const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
    const rows = [
        headers.map((header) => csvEscape(titleCase(header))).join(','),
        ...records.map((record) => headers.map((header) => csvEscape(record[header] ?? '')).join(',')),
    ];
    return `${rows.join('\n')}\n`;
}

function buildExcelXml(sheetName: string, records: ExportRecord[]) {
    const headers = records.length ? Array.from(new Set(records.flatMap((record) => Object.keys(record)))) : ['message'];
    const rows = records.length
        ? records.map((record) => headers.map((header) => record[header] ?? ''))
        : [['No data available']];

    const headerRow = `<Row>${headers.map((header) => `<Cell><Data ss:Type="String">${xmlEscape(titleCase(header))}</Data></Cell>`).join('')}</Row>`;
    const bodyRows = rows.map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`).join('')}</Row>`).join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${xmlEscape(sheetName)}">
  <Table>
   ${headerRow}
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

function buildSimplePdf(title: string, records: ExportRecord[]) {
    const lines = [
        title,
        '',
        ...(records.length
            ? records.flatMap((record, index) => [
                `${index + 1}. ${Object.entries(record).map(([key, value]) => `${titleCase(key)}: ${sanitizeCell(value)}`).join(' | ')}`,
                '',
            ])
            : ['No data available']),
    ].slice(0, 40);

    const contentLines = lines.map((line, index) => `BT /F1 11 Tf 50 ${760 - index * 16} Td (${pdfEscape(line)}) Tj ET`).join('\n');
    const stream = `${contentLines}\n`;
    const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
        `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}endstream endobj`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const object of objects) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${object}\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
}

export function detectExportRequest(prompt: string): ExportRequest | null {
    const text = prompt.toLowerCase();
    const exportIntent = text.includes('export') || text.includes('download') || text.includes('make a pdf') || text.includes('create a pdf');
    const formatIntent = text.includes('csv') || text.includes('excel') || text.includes('xlsx') || text.includes('xls') || text.includes('pdf') || text.includes('spreadsheet');

    if (!exportIntent && !formatIntent) {
        return null;
    }

    return {
        dataset: inferDataset(prompt),
        format: inferFormat(prompt),
        prompt,
    };
}

export class ExportService {
    private async fetchListings(tenantId: string) {
        const { data, error } = await getClient()
            .from('listings')
            .select('id, structured_data, raw_text, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw new Error(error.message);
        return (data || []).map((row: any) => ({
            id: row.id,
            title: row.structured_data?.title || row.structured_data?.building_name || row.structured_data?.location || 'Listing',
            location: row.structured_data?.location || row.structured_data?.locality || '',
            price: row.structured_data?.price || '',
            deal_type: row.structured_data?.deal_type || '',
            created_at: row.created_at || '',
            raw_text: row.raw_text || '',
        }));
    }

    private async fetchRequirements(tenantId: string) {
        const { data, error } = await getClient()
            .from('lead_records')
            .select('lead_id,name,phone,location_hint,locality_canonical,budget,record_type,raw_text,created_at')
            .eq('tenant_id', tenantId)
            .eq('record_type', 'buyer_requirement')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw new Error(error.message);
        return (data || []).map((row: any) => ({
            lead_id: row.lead_id,
            name: row.name || '',
            phone: row.phone || '',
            locality: row.locality_canonical || row.location_hint || '',
            budget: row.budget || '',
            created_at: row.created_at || '',
            raw_text: row.raw_text || '',
        }));
    }

    private async fetchFollowUps(tenantId: string) {
        const { data, error } = await getClient()
            .from('follow_up_tasks')
            .select('id,lead_name,lead_phone,action_type,due_at,status,priority_bucket,notes,created_at')
            .eq('tenant_id', tenantId)
            .order('due_at', { ascending: true })
            .limit(100);

        if (error) throw new Error(error.message);
        return (data || []).map((row: any) => ({
            id: row.id,
            lead_name: row.lead_name || '',
            lead_phone: row.lead_phone || '',
            action_type: row.action_type || '',
            due_at: row.due_at || '',
            status: row.status || '',
            priority: row.priority_bucket || '',
            notes: row.notes || '',
            created_at: row.created_at || '',
        }));
    }

    private async getRecords(tenantId: string, dataset: ExportDataset): Promise<ExportRecord[]> {
        switch (dataset) {
            case 'requirements':
                return this.fetchRequirements(tenantId);
            case 'followups':
                return this.fetchFollowUps(tenantId);
            case 'crm': {
                const [listings, requirements] = await Promise.all([
                    this.fetchListings(tenantId),
                    this.fetchRequirements(tenantId),
                ]);
                return [
                    ...listings.map((row: ExportRecord) => ({ record_type: 'listing', ...row })),
                    ...requirements.map((row: ExportRecord) => ({ record_type: 'requirement', ...row })),
                ];
            }
            case 'listings':
            default:
                return this.fetchListings(tenantId);
        }
    }

    async createExport(tenantId: string, request: ExportRequest) {
        const records = await this.getRecords(tenantId, request.dataset);
        await fs.mkdir(EXPORT_DIR, { recursive: true });

        const extension = request.format === 'excel' ? 'xls' : request.format;
        const fileBase = `${tenantId}-${request.dataset}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const fileName = `${fileBase}.${extension}`;
        const filePath = path.join(EXPORT_DIR, fileName);
        const title = `${titleCase(request.dataset)} Export`;

        const content = request.format === 'excel'
            ? buildExcelXml(title, records)
            : request.format === 'pdf'
                ? buildSimplePdf(title, records)
                : buildCsv(records);

        await fs.writeFile(filePath, content, request.format === 'pdf' ? undefined : 'utf8');

        return {
            fileName,
            absolutePath: filePath,
            downloadPath: `/api/ai/exports/${fileName}`,
            format: request.format,
            dataset: request.dataset,
            recordCount: records.length,
        };
    }

    async resolveExportFile(tenantId: string, fileName: string) {
        const normalized = path.basename(fileName);
        if (!normalized.startsWith(`${tenantId}-`)) {
            return null;
        }

        const absolutePath = path.join(EXPORT_DIR, normalized);
        try {
            await fs.access(absolutePath);
            return absolutePath;
        } catch {
            return null;
        }
    }
}

export const exportService = new ExportService();
