import { createWhatsAppRuntimeService } from './runtime/whatsappRuntimeService';

const ENABLE_SYSTEM_WHATSAPP_SESSION = process.env.ENABLE_SYSTEM_WHATSAPP_SESSION === 'true';
const STARTUP_TIMEOUT_MS = Number(process.env.WHATSAPP_RUNTIME_STARTUP_TIMEOUT_MS || 60_000);

const runtime = createWhatsAppRuntimeService({
    enableSystemSession: ENABLE_SYSTEM_WHATSAPP_SESSION,
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

async function shutdown(signal: string) {
    console.log(`[${signal}] WhatsApp worker shutdown initiated...`);
    await runtime.stop();
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void runtime.start().then(() => {
    console.log('[startup] WhatsApp worker running.');
}).catch((error) => {
    console.error('[startup] WhatsApp worker failed to start:', error);
    process.exit(1);
});

