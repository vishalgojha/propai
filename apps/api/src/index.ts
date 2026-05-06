import express from 'express';
import cors from 'cors';
import whatsappRoutes from './routes/whatsappRoutes';
import intelligenceRouter from './intelligence/IntelligenceRouter';
import channelRoutes from './routes/channelRoutes';
import streamRoutes from './routes/streamRoutes';
import aiRoutes from './routes/aiRoutes';
import agentRoutes from './routes/agentRoutes';
import adminRoutes from './routes/adminRoutes';
import broadcastRoutes from './routes/broadcastRoutes';
import voiceRoutes from './routes/voiceRoutes';
import authRoutes from './routes/authRoutes';
import settingsRoutes from './routes/settingsRoutes';
import workspaceRoutes from './routes/workspaceRoutes';
import fs from 'fs';
import path from 'path';
import { errorHandler } from './middleware/errorMiddleware';
import { authMiddleware } from './middleware/authMiddleware';
import { sessionManager } from './whatsapp/SessionManager';
import { ROUTE_PATHS } from './routes/routePaths';

const app = express();
const PORT = process.env.PORT || 3001;
const ENABLE_SYSTEM_WHATSAPP_SESSION = process.env.ENABLE_SYSTEM_WHATSAPP_SESSION === 'true';

function getSupabaseProjectRef() {
    const url = process.env.SUPABASE_URL || 'https://wnrwntumacbirbndfvwg.supabase.co';
    try {
        return new URL(url).hostname.split('.')[0] || null;
    } catch {
        return null;
    }
}

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

app.use(cors());
app.use(express.json());

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
app.use(ROUTE_PATHS.api.whatsapp, authMiddleware, whatsappRoutes);
// Intelligence API (standalone, behind feature flag)
app.use('/api/intelligence', intelligenceRouter);
app.use(ROUTE_PATHS.api.channels, authMiddleware, channelRoutes);
app.use('/api/stream-items', authMiddleware, streamRoutes);
app.use(ROUTE_PATHS.api.broadcast, authMiddleware, broadcastRoutes);
app.use(ROUTE_PATHS.api.settings, authMiddleware, settingsRoutes);
app.use(ROUTE_PATHS.api.workspace, authMiddleware, workspaceRoutes);
app.use(ROUTE_PATHS.api.ai, authMiddleware, aiRoutes);
app.use(ROUTE_PATHS.api.agent, authMiddleware, agentRoutes);
app.use(ROUTE_PATHS.api.admin, authMiddleware, adminRoutes);
app.use(ROUTE_PATHS.api.voice, authMiddleware, voiceRoutes);

app.get(ROUTE_PATHS.api.health, (req, res) => {
    res.json({
        status: 'ok',
        supabaseProjectRef: getSupabaseProjectRef(),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    void (async () => {
        try {
            await sessionManager.rehydratePersistedSessions();
            if (ENABLE_SYSTEM_WHATSAPP_SESSION) {
                await sessionManager.initSystemSession();
            } else {
                console.log('System WhatsApp session disabled. Set ENABLE_SYSTEM_WHATSAPP_SESSION=true to enable it.');
            }
        } catch (error) {
            console.error('Startup initialization failed:', error);
        }
    })();
});
