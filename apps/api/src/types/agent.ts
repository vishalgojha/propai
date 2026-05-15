export type AgentOutputFormat = 'text' | 'table' | 'summary_card' | 'timeline' | 'bullet_list';

export type AgentResponse = {
    message: string;
    output_format: AgentOutputFormat;
    data?: Record<string, unknown>;
};

const allowedOutputFormats = new Set<AgentOutputFormat>([
    'text',
    'table',
    'summary_card',
    'timeline',
    'bullet_list',
]);

function extractJsonObject(text: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return text.slice(start, end + 1).trim();
    }

    return '';
}

function stripAgentResponsePrefix(text: string) {
    return text.replace(/^\s*AgentResponse:\s*/i, '').trim();
}

export function toAgentResponse(message: string, outputFormat: AgentOutputFormat = 'text', data?: Record<string, unknown>): AgentResponse {
    return {
        message,
        output_format: outputFormat,
        ...(data ? { data } : {}),
    };
}

function normalizeAgentResponseShape(value: unknown): AgentResponse | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const parsed = value as Record<string, unknown>;

    if (typeof parsed.message === 'string') {
        return {
            message: parsed.message.trim(),
            output_format: allowedOutputFormats.has(parsed.output_format as AgentOutputFormat)
                ? (parsed.output_format as AgentOutputFormat)
                : 'text',
            ...(parsed.data && typeof parsed.data === 'object' ? { data: parsed.data as Record<string, unknown> } : {}),
        };
    }

    if (typeof parsed.content === 'string') {
        return {
            message: parsed.content.trim(),
            output_format: allowedOutputFormats.has(parsed.output_format as AgentOutputFormat)
                ? (parsed.output_format as AgentOutputFormat)
                : allowedOutputFormats.has(parsed.type as AgentOutputFormat)
                    ? (parsed.type as AgentOutputFormat)
                    : 'text',
            ...(parsed.data && typeof parsed.data === 'object' ? { data: parsed.data as Record<string, unknown> } : {}),
        };
    }

    if (typeof parsed.AgentResponse === 'string') {
        return toAgentResponse(parsed.AgentResponse.trim());
    }

    if (parsed.AgentResponse && typeof parsed.AgentResponse === 'object') {
        const nested = normalizeAgentResponseShape(parsed.AgentResponse);
        if (nested) {
            return nested;
        }
    }

    if (typeof parsed.reply === 'string') {
        return toAgentResponse(parsed.reply.trim());
    }

    if (typeof parsed.text === 'string') {
        return toAgentResponse(parsed.text.trim());
    }

    return null;
}

export function parseAgentResponse(rawText: string): AgentResponse {
    const cleanedText = stripAgentResponsePrefix(rawText);
    const fallback = toAgentResponse(cleanedText, 'text');
    const jsonText = extractJsonObject(cleanedText);

    if (!jsonText) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(jsonText) as unknown;
        const normalized = normalizeAgentResponseShape(parsed);
        if (normalized) {
            return normalized;
        }
        return fallback;
    } catch {
        return fallback;
    }
}
