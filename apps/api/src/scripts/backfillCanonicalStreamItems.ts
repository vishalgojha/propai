import 'dotenv/config';
import { canonicalizationService } from '../services/canonicalizationService';
import { supabaseAdmin } from '../config/supabase';

declare const process: any;

type CliOptions = {
  tenantId: string | null;
  batchSize: number;
  onlyMissing: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    tenantId: process.env.PROPAI_TENANT_ID || null,
    batchSize: 250,
    onlyMissing: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--tenant' && next) {
      options.tenantId = next.trim();
      index += 1;
    } else if (arg === '--batch-size' && next) {
      const value = Number(next);
      options.batchSize = Number.isFinite(value) && value > 0 ? Math.floor(value) : options.batchSize;
      index += 1;
    } else if (arg === '--reparse-all') {
      options.onlyMissing = false;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  if (!options.tenantId) {
    throw new Error('--tenant or PROPAI_TENANT_ID is required');
  }

  const result = await canonicalizationService.backfillTenantStreamItems(
    options.tenantId,
    options.batchSize,
    options.onlyMissing,
  );

  console.log(JSON.stringify({
    tenant: options.tenantId,
    batch_size: options.batchSize,
    only_missing: options.onlyMissing,
    ...result,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
