import express from 'express';
import cors from 'cors';
import dns from 'dns';
import whatsappRoutes from './routes/whatsappRoutes';
import intelligenceRouter from './intelligence/IntelligenceRouter';
import channelRoutes from './routes/channelRoutes';
import streamRoutes from './routes/streamRoutes';
import aiRoutes from './routes/aiRoutes';
import agentRoutes from './routes/agentRoutes';
import adminRoutes from './routes/adminRoutes';
import broadcastRoutes from './routes/broadcastRoutes';
import ingestRoutes from './routes/ingestRoutes';
import voiceRoutes from './routes/voiceRoutes';
import authRoutes from './routes/authRoutes';
import settingsRoutes from './routes/settingsRoutes';
import workspaceRoutes from './routes/workspaceRoutes';
import fileRoutes from './routes/fileRoutes';
import identityRoutes from './routes/identityRoutes';
import waClickRoutes from './routes/waClickRoutes';
import notificationRoutes from './routes/notificationRoutes';
import whatsappPresenceRoutes from './routes/whatsappPresenceRoutes';
import brokerContactRoutes from './routes/brokerContactRoutes';
import syndicationRoutes from './routes/syndicationRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import vaultRoutes from './routes/vaultRoutes';
import igrRoutes from './routes/igrRoutes';
import locationRoutes from './routes/locationRoutes';
import whatsappCloudRoutes from './routes/whatsappCloudRoutes';
import fs from 'fs';
import path from 'path';
import { errorHandler } from './middleware/errorMiddleware';
import { authMiddleware } from './middleware/authMiddleware';

import { sessionManager } from './whatsapp/SessionManager';
import { whatsappHealthService } from './services/whatsappHealthService';
import { historySyncWorker } from './services/historySyncWorker';
import { syndicationSyncJob } from './jobs/syndicationSyncJob';
import { generateMarketInsightsJob } from './jobs/generateMarketInsights';
import { igrEnrichmentJob } from './jobs/igrEnrichmentJob';
import { followUpOverdueJob } from './jobs/followUpOverdueJob';
import { ROUTE_PATHS } from './routes/routePaths';

const app = express();
const PORT = process.env.PORT || 3001;
const ENABLE_SYSTEM_WHATSAPP_SESSION = process.env.ENABLE_SYSTEM_WHATSAPP_SESSION === 'true';
const corsOptions = {
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (
            origin === 'https://propai.live'
            || origin === 'https://app.propai.live'
            || origin === 'https://www.propai.live'
            || origin.endsWith('.propai.live')
            || origin.startsWith('http://localhost:')
            || origin.startsWith('http://127.0.0.1:')
        ) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: false,
    optionsSuccessStatus: 204,
};

// Prefer IPv4 for outbound lookups. Several providers intermittently stall on IPv6
// from containerized deployments, which can surface as long auth/network timeouts.
dns.setDefaultResultOrder('ipv4first');

function getSupabaseProjectRef() {
    const url = process.env.SUPABASE_URL;
    if (!url) {
        return null;
    }
    try {
        return new URL(url).hostname.split('.')[0] || null;
    } catch {
        return null;
    }
}

function classifySupabaseHealthError(error: any) {
    const code = String(error?.code || error?.statusCode || error?.status || '').trim();
    const message = String(error?.message || '').toLowerCase();

    if (code === '401' || code === '403' || message.includes('jwt') || message.includes('invalid api key') || message.includes('bad jwt')) {
        return 'unauthorized';
    }

    if (
        message.includes('enotfound')
        || message.includes('eai_again')
        || message.includes('econnreset')
        || message.includes('econnrefused')
        || message.includes('fetch failed')
        || message.includes('network')
        || message.includes('timeout')
    ) {
        return 'network';
    }

    if (code === '42P01' || message.includes('does not exist') || message.includes('schema cache')) {
        return 'schema';
    }

    return code || 'unknown';
}

async function probeSupabaseRest(sbUrl: string, sbKey: string, table: string, params: Record<string, string> = {}) {
    const url = new URL(`/rest/v1/${table}`, sbUrl);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    const text = await response.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const errorMessage = Array.isArray(payload)
            ? text
            : String(payload?.message || payload?.error || text || response.statusText || 'Supabase REST probe failed');
        return { ok: false, status: response.status, error: errorMessage };
    }

    return { ok: true, data: payload };
}

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    // Exit so the orchestrator (Coolify/Docker) can restart a clean process.
    // Staying alive in a corrupted state causes persistent 502s.
    process.exit(1);
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '25mb' }));

app.use(ROUTE_PATHS.api.voiceListen, express.raw({ type: 'audio/wav', limit: '10mb' }));

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'propai-api',
        health: ROUTE_PATHS.api.health,
    });
});

const sessionsDir = path.join(__dirname, '../sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Public routes - property search
app.get(ROUTE_PATHS.api.propertiesSearch, (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    
    const message = String(q);
    const properties = filterProperties(message);
    res.json({
        response: buildPropertySearchResponse(properties.length),
        properties,
    });
});

// Public route — example prompts for login page
app.get(ROUTE_PATHS.api.examplePrompts, async (req, res) => {
  try {
    const sbUrl = process.env.SUPABASE_URL || '';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (!sbUrl || !sbKey) {
      return res.json({ prompts: staticFallback() });
    }
    const [resData, comData] = await Promise.all([
      probeSupabaseRest(sbUrl, sbKey, 'stream_items_residential', {
        select: 'bhk,locality,price_label,record_type,city',
        record_type: 'neq.buyer_requirement',
        bhk: 'not.is.null',
        locality: 'not.is.null',
        price_label: 'not.is.null',
        order: 'created_at.desc',
        limit: '20',
      }),
      probeSupabaseRest(sbUrl, sbKey, 'stream_items_commercial', {
        select: 'bhk,locality,price_label,record_type,city',
        record_type: 'neq.buyer_requirement',
        bhk: 'not.is.null',
        locality: 'not.is.null',
        price_label: 'not.is.null',
        order: 'created_at.desc',
        limit: '20',
      }),
    ]);
    const data = [
      ...(resData.ok && Array.isArray(resData.data) ? resData.data : []),
      ...(comData.ok && Array.isArray(comData.data) ? comData.data : []),
    ];

    if (!data || !data.length) {
      return res.json({ prompts: staticFallback() });
    }

    const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 4);
    const prompts = shuffled.map((item) => {
      const bhk = String(item.bhk || '').trim();
      const loc = String(item.locality || '').trim();
      const price = String(item.price_label || '').trim();
      return `${bhk} in ${loc}${price ? `, ${price}` : ''} — is this still available?`;
    });
    res.json({ prompts });
  } catch {
    res.json({ prompts: staticFallback() });
  }
  function staticFallback() {
    return ['3BHK Bandra West 1.8Cr sale, owner direct', '2BHK Powai requirement, budget 70 lakh', 'Remind me to call Rahul tomorrow 10am', 'Show me hot leads from this week'];
  }
});

app.post(ROUTE_PATHS.api.aiPropertySearch, (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const properties = filterProperties(message);
    res.json({
        response: buildPropertySearchResponse(properties.length),
        properties,
    });
});

app.use(ROUTE_PATHS.api.auth, authRoutes);
app.use(ROUTE_PATHS.api.whatsappCloud, whatsappCloudRoutes);
app.use(ROUTE_PATHS.api.whatsapp, authMiddleware, whatsappRoutes);
app.use('/api/whatsapp/presence', authMiddleware, whatsappPresenceRoutes);
// Intelligence API (standalone, behind feature flag)
app.use('/api/intelligence', intelligenceRouter);
app.use(ROUTE_PATHS.api.channels, authMiddleware, channelRoutes);
app.use('/api/stream-items', authMiddleware, streamRoutes);
app.use(ROUTE_PATHS.api.broadcast, authMiddleware, broadcastRoutes);
app.use(ROUTE_PATHS.api.ingest, ingestRoutes);
app.use(ROUTE_PATHS.api.settings, authMiddleware, settingsRoutes);
app.use(ROUTE_PATHS.api.workspace, authMiddleware, workspaceRoutes);
app.use(ROUTE_PATHS.api.files, fileRoutes);
app.use(ROUTE_PATHS.api.ai, authMiddleware, aiRoutes);
app.use(ROUTE_PATHS.api.agent, authMiddleware, agentRoutes);
app.use(ROUTE_PATHS.api.admin, authMiddleware, adminRoutes);
app.use(ROUTE_PATHS.api.voice, authMiddleware, voiceRoutes);
app.use(ROUTE_PATHS.api.identity, authMiddleware, identityRoutes);
app.use('/api/wa-click', authMiddleware, waClickRoutes);
app.use(ROUTE_PATHS.api.notifications, authMiddleware, notificationRoutes);
app.use(ROUTE_PATHS.api.brokerContacts, authMiddleware, brokerContactRoutes);
app.use(ROUTE_PATHS.api.syndication, authMiddleware, syndicationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/igr', igrRoutes);
app.use('/api/location', locationRoutes);

app.get(ROUTE_PATHS.api.health, async (req, res) => {
    const health: Record<string, unknown> = {
        status: 'ok',
        supabaseProjectRef: getSupabaseProjectRef(),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
    };

    // Check Supabase connectivity
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const sbUrl = process.env.SUPABASE_URL || '';
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
        if (sbUrl && sbKey) {
            const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            const { error } = await sb.from('whatsapp_sessions').select('id').limit(1);
            if (error) {
                health.database = 'degraded';
                health.databaseReason = classifySupabaseHealthError(error);
                health.databaseMessage = String(error.message || '').slice(0, 180);
            } else {
                health.database = 'connected';
            }
        }
    } catch (e: any) {
        health.database = 'unreachable';
        health.databaseError = String(e?.message || e || 'unknown').slice(0, 240);
        health.databaseErrorStack = String(e?.stack || '').slice(0, 600);
        console.error('[health] supabase check threw:', e?.message || e, e?.stack);
    }

    // Check Ollama embedding service (powers semantic_search and embedStreamItem)
    try {
        const { checkEmbeddingHealth } = await import('./services/embeddingService');
        const embHealth = await checkEmbeddingHealth();
        if (embHealth.ok) {
            health.embedding = 'connected';
        } else if (embHealth.error && /not found|model/i.test(embHealth.error)) {
            health.embedding = 'no_model';
            health.embeddingError = embHealth.error;
        } else {
            health.embedding = 'unreachable';
            health.embeddingError = embHealth.error;
        }
    } catch (e: any) {
        health.embedding = 'unreachable';
        health.embeddingError = e?.message || 'health check threw';
    }

    const dbStatus = health.database as string | undefined;
    const embStatus = health.embedding as string | undefined;
    if (dbStatus === 'unreachable' || dbStatus === 'degraded' || embStatus === 'unreachable' || embStatus === 'no_model') {
        health.status = 'degraded';
        return res.status(503).json(health);
    }

    res.json(health);
});

function filterProperties(query: string) {
    const normalizedQuery = query.toLowerCase().trim();
    const terms = normalizedQuery.split(/\s+/).filter((term) => term.length >= 2);
    const demo = [
        { id: '1', title: '2BHK in Bandra West', location: 'Bandra West, Mumbai', price: '₹85L', details: '950 sqft, modern amenities, close to station', match: 92 },
        { id: '2', title: '3BHK in Worli Sea Face', location: 'Worli, Mumbai', price: '₹1.2Cr', details: '1500 sqft, sea view, premium society', match: 85 },
        { id: '3', title: '1BHK Rental in Powai', location: 'Powai, Mumbai', price: '₹35k/mo', details: '650 sqft, fully furnished, near IIT', match: 78 },
        { id: '4', title: '4BHK Penthouse Juhu', location: 'Juhu, Mumbai', price: '₹2.5Cr', details: '2500 sqft, terrace, sea facing', match: 72 },
        { id: '5', title: '2BHK Rental Andheri', location: 'Andheri East', price: '₹28k/mo', details: '800 sqft, metro nearby', match: 68 },
    ];

    if (!terms.length) {
        return demo.slice(0, 5);
    }

    return demo
        .map((property) => {
            const text = `${property.title} ${property.location} ${property.details}`.toLowerCase();
            const score = terms.reduce((total, term) => {
                if (!text.includes(term)) return total;
                const locationBoost = property.location.toLowerCase().includes(term) ? 2 : 0;
                const titleBoost = property.title.toLowerCase().includes(term) ? 1 : 0;
                return total + 1 + locationBoost + titleBoost;
            }, 0);

            return { property, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || right.property.match - left.property.match)
        .map((entry) => entry.property)
        .slice(0, 5);
}

function buildPropertySearchResponse(count: number) {
    if (count === 0) {
        return 'I could not find a close property match in the current sample inventory. Try a more specific locality, BHK, or budget.';
    }

    if (count === 1) {
        return 'I found 1 property that looks relevant. Let me know if you want a tighter shortlist or a buyer match next.';
    }

    return `I found ${count} properties matching your criteria. Let me know if you want a tighter shortlist or buyer matching next.`;
}

app.use(errorHandler);

let server: ReturnType<typeof app.listen> | null = null;

async function gracefulShutdown(signal: string) {
    console.log(`[${signal}] Graceful shutdown initiated...`);

    // Disconnect all WhatsApp sessions cleanly to avoid "replaced" conflicts
    try {
        await sessionManager.disconnectAllSessions();
        whatsappHealthService.stopHeartbeatLoop();
        console.log('[shutdown] All WhatsApp sessions disconnected.');
    } catch (error) {
        console.error('[shutdown] Error disconnecting WhatsApp sessions:', error);
    }

    // Stop background workers
    try {
        historySyncWorker.stop();
        syndicationSyncJob.stop?.();
        generateMarketInsightsJob.stop?.();
        igrEnrichmentJob.stop?.();
        followUpOverdueJob.stop();
        console.log('[shutdown] Background workers stopped.');
    } catch (error) {
        console.error('[shutdown] Error stopping workers:', error);
    }

    // Close HTTP server
    if (server) {
        server.close(() => {
            console.log('[shutdown] HTTP server closed.');
            process.exit(0);
        });

        // Force exit after 10s if connections don't close
        setTimeout(() => {
            console.error('[shutdown] Force exit after timeout.');
            process.exit(1);
        }, 10_000);
    } else {
        process.exit(0);
    }
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Async startup tasks with timeout — if any step hangs, log and continue
    // so the server remains responsive for non-WhatsApp endpoints.
    const STARTUP_TIMEOUT_MS = 60_000; // 60s max for all startup tasks
    const startupDeadline = Date.now() + STARTUP_TIMEOUT_MS;

    void (async () => {
        try {
            console.log('[startup] Rehydrating WhatsApp sessions...');
            await Promise.race([
                sessionManager.rehydratePersistedSessions(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Session rehydration timed out')), Math.max(0, startupDeadline - Date.now()))),
            ]);
            console.log('[startup] Sessions rehydrated.');

            if (Date.now() > startupDeadline) {
                console.warn('[startup] Startup deadline exceeded, skipping remaining tasks.');
                return;
            }

            historySyncWorker.start();
            syndicationSyncJob.start();
            generateMarketInsightsJob.start();
            igrEnrichmentJob.start();
            followUpOverdueJob.start();

            if (ENABLE_SYSTEM_WHATSAPP_SESSION) {
                await sessionManager.initSystemSession();
            } else {
                console.log('[startup] System WhatsApp session disabled.');
            }

            whatsappHealthService.startHeartbeatLoop(sessionManager);

            console.log('[startup] All initialization complete.');
        } catch (error) {
            console.error('[startup] Initialization error (server remains running):', error);
        }
    })();
});
