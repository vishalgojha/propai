import 'dotenv/config';
import { channelService } from '../services/channelService';

declare const process: any;

type CliOptions = {
  tenantId: string | null;
  sessionLabel: string | null;
  remoteJid: string | null;
  limit: number;
  from: string | null;
  to: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    tenantId: process.env.PROPAI_TENANT_ID || null,
    sessionLabel: null,
    remoteJid: null,
    limit: 2000,
    from: null,
    to: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--tenant' && next) {
      options.tenantId = next.trim();
      index += 1;
    } else if (arg === '--session-label' && next) {
      options.sessionLabel = next.trim() || null;
      index += 1;
    } else if (arg === '--remote-jid' && next) {
      options.remoteJid = next.trim() || null;
      index += 1;
    } else if (arg === '--from' && next) {
      options.from = next.trim() || null;
      index += 1;
    } else if (arg === '--to' && next) {
      options.to = next.trim() || null;
      index += 1;
    } else if (arg === '--limit' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = Math.floor(parsed);
      }
      index += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.tenantId) {
    throw new Error('--tenant or PROPAI_TENANT_ID is required');
  }

  const result = await channelService.rebuildStreamFromMessages(options.tenantId, {
    limit: options.limit,
    sessionLabel: options.sessionLabel,
    remoteJid: options.remoteJid,
    from: options.from,
    to: options.to,
  });

  console.log(JSON.stringify({
    tenant: options.tenantId,
    session_label: options.sessionLabel,
    remote_jid: options.remoteJid,
    ...result,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
