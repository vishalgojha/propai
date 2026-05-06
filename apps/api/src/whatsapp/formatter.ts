import { AgentResponse } from '../types/agent';

function normalizeListItems(response: AgentResponse) {
    const items = response.data?.items;
    if (Array.isArray(items)) {
        return items
            .map((item) => {
                if (typeof item === 'string') {
                    return item.trim();
                }

                if (item && typeof item === 'object') {
                    const entry = item as Record<string, unknown>;
                    const parts = [entry.title, entry.url, entry.snippet].filter(Boolean).map((part) => String(part).trim());
                    return parts.join(' - ');
                }

                return String(item).trim();
            })
            .filter(Boolean);
    }

    return response.message
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function renderBulletList(response: AgentResponse) {
    const items = normalizeListItems(response);
    if (!items.length) {
        return response.message;
    }

    return items.map((item) => `• ${item.replace(/^[•\-*]\s*/, '')}`).join('\n');
}

function renderSummaryCard(response: AgentResponse) {
    const payload = response.data || {};
    const orderedFields: Array<[string, unknown]> = [
        ['Name', payload.name],
        ['Budget', payload.budget],
        ['Location', payload.location],
        ['Status', payload.status],
    ];

    const extraFields = Object.entries(payload).filter(([key]) => !['name', 'budget', 'location', 'status'].includes(key));
    const lines = [
        ...orderedFields.filter(([, value]) => value !== undefined && value !== null && String(value).trim()).map(([label, value]) => `*${label}:* ${String(value).trim()}`),
        ...extraFields.slice(0, 2).map(([key, value]) => `*${key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}:* ${String(value).trim()}`),
    ];

    return lines.length ? lines.join('\n') : response.message;
}

function renderTimeline(response: AgentResponse) {
    const items = response.data?.items;
    if (!Array.isArray(items) || !items.length) {
        return response.message;
    }

    return items
        .map((item, index) => {
            if (typeof item === 'string') {
                return `${index + 1}. ${item.trim()}`;
            }

            if (item && typeof item === 'object') {
                const entry = item as Record<string, unknown>;
                const parts = [entry.title, entry.detail, entry.timestamp].filter(Boolean).map((part) => String(part).trim());
                return `${index + 1}. ${parts.join(' - ')}`;
            }

            return `${index + 1}. ${String(item).trim()}`;
        })
        .join('\n');
}

function renderTable(response: AgentResponse) {
    const rows = Array.isArray(response.data?.rows) ? (response.data?.rows as unknown[]) : [];
    const headers = Array.isArray(response.data?.headers) ? (response.data?.headers as unknown[]) : [];
    const normalizedRows = rows
        .map((row) => (Array.isArray(row) ? row.slice(0, 3).map((cell) => String(cell ?? '').trim()) : []))
        .filter((row) => row.length);

    if (!headers.length && !normalizedRows.length) {
        return response.message;
    }

    const allRows = [
        headers.slice(0, 3).map((cell) => String(cell ?? '').trim()),
        ...normalizedRows,
    ].filter((row) => row.length);

    const widths = [0, 0, 0];
    allRows.forEach((row) => {
        row.forEach((cell, index) => {
            widths[index] = Math.min(Math.max(widths[index], cell.length), 24);
        });
    });

    return allRows
        .map((row) =>
            row
                .map((cell, index) => cell.padEnd(widths[index], ' '))
                .join('   ')
                .trimEnd(),
        )
        .join('\n');
}

export function renderOutput(response: AgentResponse) {
    switch (response.output_format) {
        case 'bullet_list':
            return renderBulletList(response);
        case 'summary_card':
            return renderSummaryCard(response);
        case 'timeline':
            return renderTimeline(response);
        case 'table':
            return renderTable(response);
        case 'text':
        default:
            return response.message;
    }
}
