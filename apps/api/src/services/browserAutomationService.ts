type CamofoxResult = Record<string, any>;

type OpenTabArgs = {
  userId: string;
  sessionKey: string;
  url: string;
};

type ActionArgs = {
  userId: string;
  tabId: string;
};

type ClickArgs = ActionArgs & {
  ref?: string;
  selector?: string;
};

type TypeArgs = ActionArgs & {
  ref?: string;
  selector?: string;
  text: string;
  pressEnter?: boolean;
};

type NavigateArgs = ActionArgs & {
  url: string;
};

type ScrollArgs = ActionArgs & {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
};

type WaitArgs = ActionArgs & {
  selector?: string;
  timeoutMs?: number;
};

type SnapshotArgs = ActionArgs & {
  includeScreenshot?: boolean;
  offset?: number;
};

type ListTabsArgs = {
  userId: string;
};

export class BrowserAutomationService {
  private readonly baseUrl = (process.env.CAMOFOX_URL || 'http://camofox-browser:9377').replace(/\/$/, '');
  private readonly allowedHosts = (process.env.CAMOFOX_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  private readonly currentTabs = new Map<string, { tabId: string; sessionKey: string }>();

  async openTab(args: OpenTabArgs): Promise<CamofoxResult> {
    if (!args.url?.trim()) {
      throw new Error('Camofox open requires a URL or search macro');
    }
    this.ensureAllowed(args.url);
    const result = await this.request('/tabs', {
      method: 'POST',
      body: {
        userId: args.userId,
        sessionKey: args.sessionKey,
        url: args.url,
      },
    });

    const tabId = String(result?.id || result?.tabId || '');
    if (tabId) {
      this.currentTabs.set(args.userId, { tabId, sessionKey: args.sessionKey });
    }

    return result;
  }

  async listTabs(args: ListTabsArgs): Promise<CamofoxResult> {
    return this.request(`/tabs?userId=${encodeURIComponent(args.userId)}`);
  }

  async snapshot(args: SnapshotArgs): Promise<CamofoxResult> {
    return this.request(
      `/tabs/${encodeURIComponent(args.tabId)}/snapshot?userId=${encodeURIComponent(args.userId)}${
        args.includeScreenshot ? '&includeScreenshot=true' : ''
      }${typeof args.offset === 'number' ? `&offset=${args.offset}` : ''}`
    );
  }

  async click(args: ClickArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/click`, {
      method: 'POST',
      body: {
        userId: args.userId,
        ref: args.ref,
        selector: args.selector,
      },
    });
  }

  async type(args: TypeArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/type`, {
      method: 'POST',
      body: {
        userId: args.userId,
        ref: args.ref,
        selector: args.selector,
        text: args.text,
        pressEnter: args.pressEnter ?? true,
      },
    });
  }

  async navigate(args: NavigateArgs): Promise<CamofoxResult> {
    if (!args.url?.trim()) {
      throw new Error('Camofox navigate requires a URL or search macro');
    }
    this.ensureAllowed(args.url);
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/navigate`, {
      method: 'POST',
      body: {
        userId: args.userId,
        url: args.url,
      },
    });
  }

  async scroll(args: ScrollArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/scroll`, {
      method: 'POST',
      body: {
        userId: args.userId,
        direction: args.direction || 'down',
        amount: args.amount ?? 600,
      },
    });
  }

  async wait(args: WaitArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/wait`, {
      method: 'POST',
      body: {
        userId: args.userId,
        selector: args.selector,
        timeoutMs: args.timeoutMs ?? 10000,
      },
    });
  }

  async screenshot(args: ActionArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/screenshot?userId=${encodeURIComponent(args.userId)}`);
  }

  async links(args: ActionArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/links?userId=${encodeURIComponent(args.userId)}`);
  }

  async press(args: ActionArgs & { key: string }): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/press`, {
      method: 'POST',
      body: {
        userId: args.userId,
        key: args.key,
      },
    });
  }

  async back(args: ActionArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/back`, {
      method: 'POST',
      body: { userId: args.userId },
    });
  }

  async forward(args: ActionArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/forward`, {
      method: 'POST',
      body: { userId: args.userId },
    });
  }

  async refresh(args: ActionArgs): Promise<CamofoxResult> {
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}/refresh`, {
      method: 'POST',
      body: { userId: args.userId },
    });
  }

  async closeTab(args: ActionArgs): Promise<CamofoxResult> {
    this.currentTabs.delete(args.userId);
    return this.request(`/tabs/${encodeURIComponent(args.tabId)}?userId=${encodeURIComponent(args.userId)}`, {
      method: 'DELETE',
    });
  }

  getCurrentTab(userId: string): { tabId: string; sessionKey: string } | null {
    return this.currentTabs.get(userId) || null;
  }

  clearCurrentTab(userId: string): void {
    this.currentTabs.delete(userId);
  }

  private async request(path: string, options: { method?: string; body?: unknown } = {}): Promise<CamofoxResult> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Camofox request failed (${response.status}): ${text}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true, raw: text };
    }
  }

  private ensureAllowed(url: string): void {
    if (!this.allowedHosts.length) return;
    if (url.trim().startsWith('@')) return;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = this.allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));

    if (!isAllowed) {
      throw new Error(`Camofox navigation blocked for disallowed host: ${parsed.hostname}`);
    }
  }
}

export const browserAutomationService = new BrowserAutomationService();
