import { Request, Response } from 'express';
import axios from 'axios';

const WEB_FETCH_TIMEOUT_MS = Number(process.env.AGENT_WEB_FETCH_TIMEOUT_MS || 10000);
const WEB_FETCH_MAX_BYTES = Number(process.env.AGENT_WEB_FETCH_MAX_BYTES || 1024 * 1024);
const WEB_FETCH_ALLOWED_HOSTS = (process.env.AGENT_WEB_FETCH_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

function parseWebFetchUrl(value: unknown): URL {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('A valid URL is required');
    }

    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only http and https URLs are allowed');
    }

    if (WEB_FETCH_ALLOWED_HOSTS.length > 0) {
        const hostname = url.hostname.toLowerCase();
        const allowed = WEB_FETCH_ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        if (!allowed) {
            throw new Error(`Host is not allowed: ${url.hostname}`);
        }
    }

    return url;
}

function notImplemented(res: Response, tool: string) {
    return res.status(501).json({
        error: `${tool} not implemented`,
        code: 'NOT_IMPLEMENTED',
    });
}

export const handleWebTool = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { tool, args } = req.body;
    
    try {
        switch (tool) {
            case 'web_fetch': {
                const url = parseWebFetchUrl(args?.url);
                const response = await axios.get(url.toString(), {
                    timeout: WEB_FETCH_TIMEOUT_MS,
                    responseType: 'text',
                    maxContentLength: WEB_FETCH_MAX_BYTES,
                    maxBodyLength: WEB_FETCH_MAX_BYTES,
                    validateStatus: (status) => status >= 200 && status < 400,
                });

                const contentType = String(response.headers['content-type'] || '').toLowerCase();
                const isTextLike = contentType === '' ||
                    contentType.includes('text/') ||
                    contentType.includes('application/json') ||
                    contentType.includes('application/xml') ||
                    contentType.includes('application/xhtml+xml');

                if (!isTextLike) {
                    return res.status(415).json({
                        error: `Unsupported content type: ${contentType || 'unknown'}`,
                        code: 'UNSUPPORTED_CONTENT_TYPE',
                    });
                }

                return res.json({
                    url: url.toString(),
                    contentType: contentType || null,
                    content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
                });
            }
            case 'search_web': {
                return notImplemented(res, 'search_web');
            }
            case 'verify_rera': {
                return notImplemented(res, 'verify_rera');
            }
            case 'fetch_property_listing': {
                return notImplemented(res, 'fetch_property_listing');
            }
            default:
                return res.status(400).json({ error: 'Unknown tool' });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
