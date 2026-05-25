import { createSupabaseBrowserClient } from '../services/supabaseBrowser';
import { readStoredSession } from '../services/authSession';

export type ActionStep = {
  type: 'navigate' | 'click' | 'fill' | 'select' | 'scroll' | 'wait' | 'highlight';
  selector?: string;
  path?: string;
  value?: string;
  duration?: number;
  description: string;
};

type ActionSequencePayload = {
  steps?: ActionStep[];
  summary?: string;
};

type AgentControlCallbacks = {
  onSequenceStart?: (steps: ActionStep[], summary?: string) => void;
  onStepComplete?: (stepIndex: number, step: ActionStep) => void;
  onStepError?: (stepIndex: number, step: ActionStep | null, error: string) => void;
  onSequenceComplete?: (steps: ActionStep[], summary?: string) => void;
  onSequenceCancelled?: (reason: string, stepIndex: number | null) => void;
};

type AgentControlSessionOptions = AgentControlCallbacks & {
  sessionId: string;
  navigate: (path: string) => void;
};

const STEP_DELAY_MS = 400;
const PROGRAMMATIC_CLICK_GUARD_MS = 250;

const sleep = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

function normalizeError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'Action failed';
}

function resolveElement(selector?: string) {
  if (!selector) {
    throw new Error('Missing selector');
  }

  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  return element as HTMLElement;
}

function isSafePath(path?: string) {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//'));
}

export class AgentControlSession {
  readonly sessionId: string;

  private readonly navigate: (path: string) => void;
  private readonly callbacks: AgentControlCallbacks;
  private readonly supabase = createSupabaseBrowserClient(readStoredSession()?.token || undefined);

  private channel: ReturnType<typeof this.supabase.channel> | null = null;
  private executing = false;
  private cancelled = false;
  private currentStepIndex: number | null = null;
  private interruptGuardUntil = 0;

  constructor(options: AgentControlSessionOptions) {
    this.sessionId = options.sessionId;
    this.navigate = options.navigate;
    this.callbacks = options;
    this.handleUserInterrupt = this.handleUserInterrupt.bind(this);
  }

  subscribe() {
    if (this.channel) {
      return;
    }

    const channel = this.supabase.channel(`agent:control:${this.sessionId}`);
    channel.on('broadcast', { event: 'action_sequence' }, ({ payload }) => {
      const data = payload as ActionSequencePayload | ActionStep[] | null;
      const steps = Array.isArray(data) ? data : Array.isArray(data?.steps) ? data.steps : [];
      const summary = Array.isArray(data) ? undefined : data?.summary;
      void this.executeSequence(steps, summary);
    });
    channel.subscribe();
    this.channel = channel;
  }

  async unsubscribe() {
    this.cancelled = true;
    document.removeEventListener('click', this.handleUserInterrupt, true);
    if (this.channel) {
      const channel = this.channel;
      this.channel = null;
      await this.supabase.removeChannel(channel);
    }
  }

  async executeSequence(steps: ActionStep[], summary?: string) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return;
    }

    if (this.executing) {
      this.cancelActiveSequence('Sequence replaced by a newer action set');
    }

    this.executing = true;
    this.cancelled = false;
    this.currentStepIndex = null;
    document.addEventListener('click', this.handleUserInterrupt, true);
    this.callbacks.onSequenceStart?.(steps, summary);

    try {
      for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
        const step = steps[stepIndex];
        this.currentStepIndex = stepIndex;

        if (this.cancelled) {
          this.callbacks.onSequenceCancelled?.('Broker interrupted the sequence', stepIndex);
          return;
        }

        await this.runStep(step);
        await this.broadcast('step_complete', {
          stepIndex,
          description: step.description,
        });
        this.callbacks.onStepComplete?.(stepIndex, step);

        if (stepIndex < steps.length - 1) {
          await sleep(STEP_DELAY_MS);
        }
      }

      await this.broadcast('sequence_complete', {
        stepCount: steps.length,
        summary: summary || steps[steps.length - 1]?.description || 'Sequence complete',
      });
      this.callbacks.onSequenceComplete?.(steps, summary);
    } catch (error) {
      const failedStep = this.currentStepIndex != null ? steps[this.currentStepIndex] || null : null;
      const message = this.cancelled ? 'Broker interrupted the sequence' : normalizeError(error);
      await this.broadcast('step_error', {
        stepIndex: this.currentStepIndex,
        error: message,
        description: failedStep?.description || 'Action failed',
      });
      if (this.cancelled) {
        this.callbacks.onSequenceCancelled?.(message, this.currentStepIndex);
      } else {
        this.callbacks.onStepError?.(this.currentStepIndex ?? -1, failedStep, message);
      }
    } finally {
      this.executing = false;
      this.currentStepIndex = null;
      document.removeEventListener('click', this.handleUserInterrupt, true);
    }
  }

  private cancelActiveSequence(reason: string) {
    this.cancelled = true;
    this.callbacks.onSequenceCancelled?.(reason, this.currentStepIndex);
  }

  private handleUserInterrupt(event: MouseEvent) {
    if (!this.executing) {
      return;
    }

    if (Date.now() < this.interruptGuardUntil) {
      return;
    }

    if (event.target instanceof Element && event.target.closest('[data-agent-ignore-interrupt="true"]')) {
      return;
    }

    this.cancelled = true;
  }

  private async broadcast(event: string, payload: Record<string, unknown>) {
    if (!this.channel) {
      return;
    }

    await this.channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  private async runStep(step: ActionStep) {
    switch (step.type) {
      case 'navigate': {
        if (!isSafePath(step.path)) {
          throw new Error('Unsafe navigation path');
        }
        this.navigate(step.path!);
        return;
      }
      case 'click': {
        const element = resolveElement(step.selector);
        this.interruptGuardUntil = Date.now() + PROGRAMMATIC_CLICK_GUARD_MS;
        element.click();
        return;
      }
      case 'fill': {
        const element = resolveElement(step.selector);
        const target = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (!('value' in target)) {
          throw new Error(`Element cannot be filled: ${step.selector}`);
        }
        target.focus();
        target.value = step.value || '';
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      case 'select': {
        const element = resolveElement(step.selector);
        if (!(element instanceof HTMLSelectElement)) {
          throw new Error(`Element is not a select: ${step.selector}`);
        }
        const wanted = String(step.value || '').trim().toLowerCase();
        const nextIndex = Array.from(element.options).findIndex((option) =>
          option.value.trim().toLowerCase() === wanted || option.text.trim().toLowerCase() === wanted,
        );
        if (nextIndex < 0) {
          throw new Error(`Option not found: ${step.value || ''}`);
        }
        element.selectedIndex = nextIndex;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      case 'scroll': {
        const element = resolveElement(step.selector);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      case 'highlight': {
        const element = resolveElement(step.selector);
        element.classList.add('agent-highlight');
        await sleep(1500);
        element.classList.remove('agent-highlight');
        return;
      }
      case 'wait': {
        await sleep(Math.max(0, Number(step.duration) || 0));
        return;
      }
      default:
        throw new Error(`Unsupported action type: ${(step as ActionStep).type}`);
    }
  }
}
