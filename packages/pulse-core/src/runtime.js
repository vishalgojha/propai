import { spawnSync } from 'node:child_process';

let bunAvailableCache;

function detectBun() {
  if (bunAvailableCache !== undefined) {
    return bunAvailableCache;
  }

  const result = spawnSync('bun', ['--version'], {
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
  });

  bunAvailableCache = result.status === 0;
  return bunAvailableCache;
}

export function isBunAvailable() {
  return detectBun();
}

export function getPreferredRuntime({ allowBun = true } = {}) {
  const forcedRuntime = String(process.env.PULSE_RUNTIME || 'auto').trim().toLowerCase();

  if (forcedRuntime === 'node') {
    return {
      runtime: 'node',
      command: process.execPath,
    };
  }

  if (forcedRuntime === 'bun') {
    if (!allowBun) {
      return {
        runtime: 'node',
        command: process.execPath,
      };
    }

    if (!isBunAvailable()) {
      throw new Error('PULSE_RUNTIME=bun was requested but bun is not installed');
    }

    return {
      runtime: 'bun',
      command: 'bun',
    };
  }

  if (allowBun && isBunAvailable()) {
    return {
      runtime: 'bun',
      command: 'bun',
    };
  }

  return {
    runtime: 'node',
    command: process.execPath,
  };
}
