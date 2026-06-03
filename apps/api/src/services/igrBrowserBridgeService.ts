import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type LiveIgrFetchInput = {
  buildingName?: string | null;
  locality?: string | null;
};

type BrowserBridgeResult = {
  success: boolean;
  rows?: Array<Record<string, string>>;
  error?: string;
  source?: string;
};

function normalize(value?: string | null): string {
  return String(value || '').trim();
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown helper failure');
}

export class IgrBrowserBridgeService {
  private readonly enabled = process.env.IGR_BROWSER_HELPER_ENABLED !== 'false';
  private readonly nodeBin = normalize(process.env.IGR_BROWSER_HELPER_NODE || process.execPath);
  private readonly scriptPath = normalize(
    process.env.IGR_BROWSER_HELPER_SCRIPT || '/home/vishal/browser automation for igr/scrape-igr.js',
  );
  private readonly cwd = normalize(process.env.IGR_BROWSER_HELPER_CWD || path.dirname(this.scriptPath));
  private readonly timeoutMs = Math.max(
    30_000,
    Number(process.env.IGR_BROWSER_HELPER_TIMEOUT_MS || 180_000),
  );

  private buildRunnerCode(scriptPath: string, input: LiveIgrFetchInput): string {
    const moduleUrl = pathToFileURL(scriptPath).href;
    const payload = JSON.stringify({
      buildingName: normalize(input.buildingName),
      locality: normalize(input.locality),
      headless: true,
      maxRetries: 3,
    });

    return `
      const original = {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console),
      };

      const write = (prefix) => (...args) => {
        const line = args
          .map((arg) => {
            if (typeof arg === 'string') return arg;
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(' ');
        if (line) {
          process.stderr.write((prefix ? prefix + ' ' : '') + line + '\\n');
        }
      };

      console.log = write('[IGR helper]');
      console.error = write('[IGR helper]');
      console.warn = write('[IGR helper]');
      console.info = write('[IGR helper]');

      try {
        const mod = await import(${JSON.stringify(moduleUrl)});
        const scrapeIGR = mod.scrapeIGR || mod.default || mod.default?.scrapeIGR;
        if (typeof scrapeIGR !== 'function') {
          throw new Error('scrapeIGR export not found');
        }

        const rows = await scrapeIGR(${payload});
        process.stdout.write(JSON.stringify({
          success: true,
          rows: Array.isArray(rows) ? rows : [],
          source: 'igr_browser_helper',
        }));
        } catch (error) {
          process.stdout.write(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            source: 'igr_browser_helper',
          }));
          process.exitCode = 1;
        } finally {
        console.log = original.log;
        console.error = original.error;
        console.warn = original.warn;
        console.info = original.info;
      }
    `;
  }

  async fetchRows(input: LiveIgrFetchInput): Promise<BrowserBridgeResult> {
    if (!this.enabled) {
      return {
        success: false,
        error: 'IGR browser helper bridge is disabled via IGR_BROWSER_HELPER_ENABLED=false',
        source: 'igr_browser_helper',
      };
    }

    if (!this.scriptPath || !existsSync(this.scriptPath)) {
      return {
        success: false,
        error: `IGR browser helper script not found at "${this.scriptPath}"`,
        source: 'igr_browser_helper',
      };
    }

    if (!this.nodeBin) {
      return {
        success: false,
        error: 'Node binary not configured for IGR browser helper',
        source: 'igr_browser_helper',
      };
    }

    return await new Promise<BrowserBridgeResult>((resolve) => {
      const child = spawn(
        this.nodeBin,
        ['--input-type=module', '--eval', this.buildRunnerCode(this.scriptPath, input)],
        {
          cwd: this.cwd || undefined,
          env: {
            ...process.env,
            IGR_VERBOSE_LOGS: process.env.IGR_VERBOSE_LOGS || 'false',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (result: BrowserBridgeResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        settle({
          success: false,
          error: `IGR browser helper timed out after ${this.timeoutMs / 1000}s`,
          source: 'igr_browser_helper',
        });
      }, this.timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        settle({
          success: false,
          error: stringifyError(error),
          source: 'igr_browser_helper',
        });
      });

      child.on('close', () => {
        clearTimeout(timer);

        const payload = stdout.trim();
        if (!payload) {
          settle({
            success: false,
            error: stderr.trim() || 'IGR browser helper returned no output',
            source: 'igr_browser_helper',
          });
          return;
        }

        try {
          const parsed = JSON.parse(payload) as BrowserBridgeResult;
          settle({
            success: Boolean(parsed.success),
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            error: parsed.error || undefined,
            source: parsed.source || 'igr_browser_helper',
          });
        } catch (error) {
          settle({
            success: false,
            error: `Failed to parse IGR helper output: ${stringifyError(error)}${stderr ? ` | ${stderr.trim()}` : ''}`,
            source: 'igr_browser_helper',
          });
        }
      });
    });
  }
}

export const igrBrowserBridgeService = new IgrBrowserBridgeService();
