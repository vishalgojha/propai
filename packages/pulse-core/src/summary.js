import { formatSummaryRecords, parseReviewArgs } from './reviewReport.js';
import { initializeStorage, listMessages } from './storage.js';

async function main() {
  const options = parseReviewArgs(['--all', ...process.argv.slice(2)]);

  await initializeStorage();
  const records = await listMessages({
    status: options.status,
    limit: options.limit,
  });

  console.log(formatSummaryRecords(records, options.format));
}

main().catch((error) => {
  console.error(`Summary failed: ${error.message}`);
  process.exit(1);
});
