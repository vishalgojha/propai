import { initializeStorage } from './storage.js';
import { connectToWhatsApp } from './whatsapp.js';

function isTransientWhatsAppDisconnect(error) {
  const statusCode =
    error?.output?.statusCode ||
    error?.data?.output?.statusCode ||
    error?.cause?.output?.statusCode;
  const message = error?.message || error?.cause?.message || '';

  return statusCode === 428 && message.includes('Connection Closed');
}

function registerProcessGuards() {
  process.on('unhandledRejection', (reason) => {
    if (isTransientWhatsAppDisconnect(reason)) {
      console.warn('Ignored transient WhatsApp disconnect during reconnect');
      return;
    }

    console.error('Unhandled rejection:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    if (isTransientWhatsAppDisconnect(error)) {
      console.warn('Ignored transient WhatsApp disconnect during reconnect');
      return;
    }

    console.error('Uncaught exception:', error);
    process.exit(1);
  });
}

async function main() {
  registerProcessGuards();
  await initializeStorage();
  await connectToWhatsApp();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
