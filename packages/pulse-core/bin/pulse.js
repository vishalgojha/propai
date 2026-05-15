#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPreferredRuntime, isBunAvailable } from '../src/runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);
const [command = 'help', ...args] = rawArgs;

function resolveCommandTarget(command, args) {
  switch (command) {
    case 'start':
      return {
        runtime: 'node',
        command: process.execPath,
        args: ['src/index.js', ...args],
      };
    case 'studio': {
      const runtime = getPreferredRuntime();
      return {
        runtime: runtime.runtime,
        command: runtime.command,
        args: ['src/studio.js', ...args],
      };
    }
    case 'review': {
      const runtime = getPreferredRuntime();
      return {
        runtime: runtime.runtime,
        command: runtime.command,
        args: ['src/review.js', ...args],
      };
    }
    case 'summary': {
      const runtime = getPreferredRuntime();
      return {
        runtime: runtime.runtime,
        command: runtime.command,
        args: ['src/summary.js', ...args],
      };
    }
    case 'test':
      if (isBunAvailable()) {
        return {
          runtime: 'bun',
          command: 'bun',
          args: ['test'],
        };
      }

      return {
        runtime: 'node',
        command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        args: ['test'],
      };
    default:
      return null;
  }
}

function printHelp() {
  console.log(`PropAI Pulse CLI

Usage:
  pulse start
  pulse studio
  pulse review [--status needs_review] [--limit 25] [--format table|json|jsonl]
  pulse summary [--limit 100] [--format table|json]
  pulse test

Runtime:
  PULSE_RUNTIME=auto|node|bun
  auto prefers Bun for utility commands when installed
  start stays on Node unless you run the entrypoint yourself under Bun

Examples:
  pulse start
  pulse studio
  pulse review --status extraction_error --limit 25
  pulse summary --format json
`);
}

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

const target = resolveCommandTarget(command, args);

if (!target) {
  console.error(`Unknown Pulse command: ${command}`);
  printHelp();
  process.exit(1);
}

const child = spawn(target.command, target.args, {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: false,
  windowsHide: false,
});

child.on('error', (error) => {
  console.error(`Pulse command failed: ${error.message}`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
