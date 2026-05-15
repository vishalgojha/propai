#!/usr/bin/env tsx
import { runPipeline, watchLoop } from "./pipeline.js";
import { getStats } from "./db.js";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const maxIdx = args.indexOf("--max");
const max = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : undefined;
const webhook = args.includes("--webhook");

const opts = { max, webhook };

async function main() {
  if (args.includes("--stats")) {
    console.log(JSON.stringify(getStats(), null, 2));
    return;
  }

  if (watch) {
    await watchLoop(opts);
  } else {
    const result = await runPipeline(opts);
    console.log(`Done. Processed: ${result.processed}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
