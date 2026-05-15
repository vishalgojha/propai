import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import http from 'http';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;
const EXPLICIT_API_TARGETS = [
  process.env.API_PUBLIC_URL,
  process.env.API_PROXY_TARGETS,
  process.env.API_PROXY_TARGET,
]
  .filter(Boolean)
  .flatMap((value) => String(value).split(','))
  .map((target) => target.trim().replace(/\/$/, ''))
  .filter(Boolean);

const INTERNAL_FALLBACK_TARGETS = [
  'http://propai-api:3001',
  'http://api:3001',
  'http://propai-api:3000',
  'http://api:3000',
  'https://api.propai.live',
  'http://api.propai.live',
];

function uniqueTargets(targets) {
  return [...new Set(targets.filter(Boolean))];
}

function normalizeHost(value) {
  return String(value || '')
    .split(',')[0]
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

function inferApiTargets(req) {
  const host = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const preferredProtocol = forwardedProto || (req.secure ? 'https' : 'http');

  if (!host) {
    return [];
  }

  const baseHost = host.replace(/:\d+$/, '');

  if (baseHost === 'localhost' || baseHost === '127.0.0.1') {
    return ['http://127.0.0.1:3001', 'http://localhost:3001'];
  }

  if (baseHost.startsWith('app.')) {
    const apiHost = `api.${baseHost.slice(4)}`;
    const options = [`${preferredProtocol}://${apiHost}`];
    if (preferredProtocol === 'https') {
      options.push(`http://${apiHost}`);
    } else {
      options.push(`https://${apiHost}`);
    }
    return options;
  }

  return [];
}

function getApiTargets(req) {
  return uniqueTargets([
    ...EXPLICIT_API_TARGETS,
    ...inferApiTargets(req),
    ...INTERNAL_FALLBACK_TARGETS,
  ]);
}

async function proxyApiRequest(req, res) {
  const headers = { ...req.headers };
  delete headers.host;

  const bodyChunks = [];
  if (!['GET', 'HEAD'].includes(req.method)) {
    for await (const chunk of req) {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  }
  const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

  let lastError = null;
  const apiTargets = getApiTargets(req);

  for (const target of apiTargets) {
    const targetUrl = `${target}${req.originalUrl}`;

    try {
      const response = await axios.request({
        url: targetUrl,
        method: req.method,
        headers,
        data: body,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        httpAgent: new http.Agent({ keepAlive: true }),
        httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
        maxRedirects: 0,
        timeout: 15000,
      });

      const isLastTarget = target === apiTargets[apiTargets.length - 1];

      if (response.status >= 500 && !isLastTarget) {
        console.warn(`API proxy target returned ${response.status}, trying next target: ${targetUrl}`);
        response.data?.destroy?.();
        continue;
      }

      res.status(response.status);
      Object.entries(response.headers || {}).forEach(([key, value]) => {
        if (key.toLowerCase() === 'transfer-encoding') return;
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      });

      const payload = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
      res.send(payload);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`API proxy target failed: ${targetUrl}`, error?.message || error);
    }
  }

  console.error('API proxy error:', lastError);
  res.status(502).json({ error: 'Failed to reach API proxy target' });
}

app.use('/api', proxyApiRequest);
app.get('/favicon.ico', (_req, res) => {
  res.type('image/svg+xml');
  res.sendFile(path.join(__dirname, 'dist', 'favicon.svg'));
});
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
