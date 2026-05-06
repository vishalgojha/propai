import { parseReviewArgs, formatReviewRecords } from './reviewReport.js';
import { initializeStorage, listMessages } from './storage.js';

async function main() {
  const options = parseReviewArgs(process.argv.slice(2));

  await initializeStorage();
  const records = await listMessages({
    status: options.status,
    limit: options.limit,
  });

  console.log(formatReviewRecords(records, options.format));
}

main().catch((error) => {
  console.error(`Review export failed: ${error.message}`);
  process.exit(1);
});
