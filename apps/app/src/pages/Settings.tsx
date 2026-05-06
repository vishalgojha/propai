import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import {
  AlertTriangleIcon,
  BellIcon,
  CheckCircleIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderIcon,
  MicIcon,
  RefreshIcon,
  SaveIcon,
  ShieldIcon,
  SmartphoneIcon,
  TrashIcon,
  WorkflowIcon,
} from '../lib/icons';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { track } from '../services/analytics';
import { SurfaceSection } from '../components/ui/SurfaceSection';
import { ProviderLogo } from '../components/ui/ProviderLogo';

interface AIConfig {
  gemini?: string;
  groq?: string;
  openrouter?: string;
  doubleword?: string;
}

interface SettingsState {
  autoSyncPeriod: string;
  deduplication: boolean;
  noiseFilter: boolean;
  tokenLogic: string;
  contextBuffer: string;
  defaultModel: string;
  elevenlabsKey: string;
  primaryVoice: string;
  autoRead: boolean;
  broadcastVoice: boolean;
  dailyBriefing: boolean;
  highValueLeads: boolean;
  performanceAnalytics: boolean;
}

const aiProviders = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    logo: 'gemini',
    description: 'Primary model path. Gemini 2.5 Flash is now the default.',
  },
  {
    id: 'groq',
    name: 'Groq',
    logo: 'groq',
    description: 'Fast OpenAI-compatible fallback for agent responses.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    logo: 'openrouter',
    description: 'Unified access to several models through one key.',
  },
  {
    id: 'doubleword',
    name: 'Doubleword',
    logo: 'doubleword',
    description: 'OpenAI-compatible provider with Qwen3 and Kimi models.',
  },
] as const;

const defaultModelOptions = [
  {
    value: 'gemini-2.5-flash',
    title: 'Gemini 2.5 Flash',
    provider: 'Google Gemini',
    logo: 'gemini' as const,
    description: 'Primary default for agent chat, routing, and structured extraction.',
  },
  {
    value: 'groq',
    title: 'Groq',
    provider: 'Groq llama3-8b-8192',
    logo: 'groq' as const,
    description: 'Fast fallback if you prefer lower latency than Gemini-first routing.',
  },
  {
    value: 'openrouter',
    title: 'OpenRouter',
    provider: 'OpenRouter openai/gpt-4o-mini',
    logo: 'openrouter' as const,
    description: 'Third fallback path through your OpenRouter key.',
  },
  {
    value: 'doubleword',
    title: 'Doubleword',
    provider: 'Doubleword qwen3-235b',
    logo: 'doubleword' as const,
    description: 'OpenAI-compatible provider with Qwen3 235B and Kimi K2 models.',
  },
] as const;

function ToggleRow({
  title,
  description,
  value,
  onToggle,
}: {
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-b border-[color:var(--border)] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          value ? 'bg-[var(--accent)]/35' : 'bg-[var(--bg-hover)]'
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-4 w-4 rounded-full transition-all duration-200',
            value ? 'right-1 bg-[var(--accent)]' : 'left-1 bg-[var(--text-muted)]'
          )}
        />
      </button>
    </div>
  );
}

function SelectRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-b border-[color:var(--border)] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{description}</p>
      </div>
      <div className="w-full shrink-0 sm:w-auto">{children}</div>
    </div>
  );
}

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsState>({
    autoSyncPeriod: 'Auto',
    deduplication: true,
    noiseFilter: true,
    tokenLogic: 'Precision',
    contextBuffer: 'Optimized',
    defaultModel: 'gemini-2.5-flash',
    elevenlabsKey: '',
    primaryVoice: 'Callum',
    autoRead: false,
    broadcastVoice: true,
    dailyBriefing: true,
    highValueLeads: true,
    performanceAnalytics: false,
  });

  const [aiKeys, setAiKeys] = useState<AIConfig>({
    gemini: '',
    groq: '',
    openrouter: '',
    doubleword: '',
  });

  const roleLabel = user?.appRole === 'super_admin' ? 'PropAI Owner' : 'Broker Partner';

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await backendApi.get(ENDPOINTS.settings.get);
      if (resp.data) {
        setSettings((prev) => ({ ...prev, ...(resp.data.settings || {}) }));
        setAiKeys(resp.data.aiKeys || {});
      }
    } catch (err) {
      const message = handleApiError(err);
      const schemaDrift = /workspace_settings|api_keys|schema cache|does not exist/i.test(message);
      setError(schemaDrift ? 'Live database is still missing the new settings tables, so saved AI keys may not load yet.' : 'Using default settings');
      console.error('Failed to load settings:', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.settings.save, { settings, aiKeys });
      track('settings_saved', {
        has_gemini_key: Boolean(aiKeys.gemini),
        has_groq_key: Boolean(aiKeys.groq),
        has_openrouter_key: Boolean(aiKeys.openrouter),
        has_doubleword_key: Boolean(aiKeys.doubleword),
        model: settings.defaultModel,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      const message = handleApiError(err);
      const schemaDrift = /workspace_settings|api_keys|schema cache|does not exist/i.test(message);
      setError(schemaDrift ? 'Settings could not be saved durably because the live database is missing the new settings tables.' : message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateAiKey = (provider: keyof AIConfig, value: string) => {
    setAiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const toggleKeyVisibility = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <ShieldIcon className="h-3.5 w-3.5" />
              Studio controls
            </div>
            <div className="space-y-2">
              <h2 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">
                Keep Pulse sharp, connected, and low-friction.
              </h2>
              <p className="max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                Manage AI keys, default cloud model selection, WhatsApp sync, and alerts from one calm launch
                screen. The defaults are already good, so you only touch what you need.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                AI keys optional
              </span>
              <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                Gemini first
              </span>
              <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                WhatsApp sync and follow-ups
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col items-start gap-3 lg:w-auto lg:items-end">
            <div className="flex w-full flex-wrap items-center justify-between gap-2 lg:w-auto lg:justify-end">
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                onClick={fetchSettings}
                className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] p-2 text-neutral-500 transition-colors hover:text-white"
                aria-label="Refresh settings"
              >
                <RefreshIcon className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </button>
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-all',
                  saved ? 'bg-green-500 text-black' : 'bg-[var(--accent)] text-[#020f07] hover:brightness-95'
                )}
              >
                {isSaving ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : saved ? (
                <CheckIcon className="h-4 w-4" />
                ) : (
                <SaveIcon className="h-4 w-4" />
                )}
                {saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
            <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Workspace</p>
              <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{user?.email}</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">{roleLabel}</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoaderIcon className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : (
        <div className="space-y-6">
          <SurfaceSection title="AI API Keys" subtitle="Add one or more keys per provider. When one key is exhausted, Pulse tries the next key before falling back to another provider." icon={ShieldIcon}>
            <div className="grid gap-4 md:grid-cols-2">
              {aiProviders.map((provider) => {
                const providerKey = provider.id as keyof AIConfig;
                const keyCount = (aiKeys[providerKey] || '')
                  .split(/[\n,;]+/)
                  .map((entry) => entry.trim())
                  .filter(Boolean).length;

                return (
                  <div key={provider.id} className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--bg-elevated)] text-[var(--accent)]">
                        <ProviderLogo provider={provider.logo} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{provider.name}</p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{provider.description}</p>
                      </div>
                    </div>
                    <div className="relative">
                      <textarea
                        rows={4}
                        name={`ai-key-${provider.id}`}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={aiKeys[providerKey] || ''}
                        onChange={(e) => updateAiKey(providerKey, e.target.value)}
                        placeholder={`Paste ${provider.name} keys, one per line`}
                        style={{ WebkitTextSecurity: showKeys[provider.id] ? 'none' : 'disc' } as React.CSSProperties}
                        className="min-h-[104px] w-full resize-y rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] py-3 pl-3 pr-10 text-[12px] leading-5 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[color:var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(provider.id)}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                        aria-label={showKeys[provider.id] ? 'Hide API key' : 'Show API key'}
                      >
                      {showKeys[provider.id] ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      {keyCount ? `${keyCount} key${keyCount === 1 ? '' : 's'} configured` : 'No keys configured'}
                    </p>
                  </div>
                );
              })}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Default AI" subtitle="Pick the primary cloud model Pulse should use first." icon={WorkflowIcon} visible>
            <div className="space-y-3">
              <div className="flex flex-col items-start gap-3 rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">Default model</p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Used for agent chat, routing, and fallback sequencing.</p>
                </div>
                <select
                  value={settings.defaultModel}
                  onChange={(e) => updateSetting('defaultModel', e.target.value)}
                  className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none sm:w-auto"
                >
                  {defaultModelOptions.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3">
                {defaultModelOptions.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => updateSetting('defaultModel', model.value)}
                    className={cn(
                      'flex flex-col items-start gap-4 rounded-[18px] border px-4 py-4 text-left transition-colors sm:flex-row sm:items-center sm:justify-between',
                      settings.defaultModel === model.value
                        ? 'border-[color:var(--accent-border)] bg-[rgba(37,211,102,0.08)]'
                        : 'border-[color:var(--border)] bg-[var(--bg-surface)] hover:border-[color:var(--border-strong)]'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--bg-elevated)] text-[var(--accent)]">
                        <ProviderLogo provider={model.logo} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{model.title}</p>
                          {settings.defaultModel === model.value && <CheckCircleIcon className="h-4 w-4 text-[var(--accent)]" />}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{model.provider}</p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{model.description}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      {settings.defaultModel === model.value ? 'Active' : 'Select'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </SurfaceSection>

          <SurfaceSection title="WhatsApp Sync" subtitle="Message parsing, de-duplication, and refresh behavior." icon={SmartphoneIcon}>
            <SelectRow
              title="Auto-sync period"
              description="How often to sync messages."
            >
              <select
                value={settings.autoSyncPeriod}
                onChange={(e) => updateSetting('autoSyncPeriod', e.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none sm:w-auto"
              >
                <option value="5 mins">5 mins</option>
                <option value="15 mins">15 mins</option>
                <option value="1 hour">1 hour</option>
                <option value="Auto">Auto</option>
              </select>
            </SelectRow>
            <ToggleRow
              title="Message de-duplication"
              description="Block repeated messages across groups."
              value={settings.deduplication}
              onToggle={() => updateSetting('deduplication', !settings.deduplication)}
            />
            <ToggleRow
              title="Noise filter"
              description="Block system messages and notifications."
              value={settings.noiseFilter}
              onToggle={() => updateSetting('noiseFilter', !settings.noiseFilter)}
            />
          </SurfaceSection>

          <SurfaceSection title="AI Behavior" subtitle="How Pulse decides, thinks, and keeps context." icon={WorkflowIcon}>
            <SelectRow
              title="Token utilization logic"
              description="How aggressively Pulse should conserve tokens."
            >
              <select
                value={settings.tokenLogic}
                onChange={(e) => updateSetting('tokenLogic', e.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none sm:w-auto"
              >
                <option value="Efficiency">Efficiency</option>
                <option value="Precision">Precision</option>
                <option value="Experimental">Experimental</option>
              </select>
            </SelectRow>
            <SelectRow
              title="Context buffer size"
              description="How much of the conversation Pulse should keep in memory."
            >
              <select
                value={settings.contextBuffer}
                onChange={(e) => updateSetting('contextBuffer', e.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none sm:w-auto"
              >
                <option value="Low">Low</option>
                <option value="Optimized">Optimized</option>
                <option value="Maximum">Maximum</option>
              </select>
            </SelectRow>
          </SurfaceSection>

          {false && <SurfaceSection title="Voice" subtitle="Optional voice output settings for later use." icon={MicIcon}>
            <div className="space-y-1 border-b border-[color:var(--border)] py-4">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">ElevenLabs API key</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Optional voice synthesis key for future voice flows.</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="relative w-full max-w-md">
                  <input
                    type={showKeys.elevenlabs ? 'text' : 'password'}
                    value={settings.elevenlabsKey}
                    onChange={(e) => updateSetting('elevenlabsKey', e.target.value)}
                    placeholder="sk_••••••••••••"
                    className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] py-3 pl-3 pr-10 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility('elevenlabs')}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
              {showKeys.elevenlabs ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <SelectRow
              title="Primary voice"
              description="Default voice for generated voice messages."
            >
              <select
                value={settings.primaryVoice}
                onChange={(e) => updateSetting('primaryVoice', e.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none sm:w-auto"
              >
                {voices.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            </SelectRow>
            <ToggleRow
              title="Auto-read intelligence"
              description="Automatically read incoming messages aloud."
              value={settings.autoRead}
              onToggle={() => updateSetting('autoRead', !settings.autoRead)}
            />
            <ToggleRow
              title="Broadcast voice notifications"
              description="Send voice messages to clients."
              value={settings.broadcastVoice}
              onToggle={() => updateSetting('broadcastVoice', !settings.broadcastVoice)}
            />
          </SurfaceSection>}

          <SurfaceSection title="Alerts" subtitle="Notifications and reporting preferences." icon={BellIcon}>
            <ToggleRow
              title="Daily market briefing"
              description="Morning summary of new listings and leads."
              value={settings.dailyBriefing}
              onToggle={() => updateSetting('dailyBriefing', !settings.dailyBriefing)}
            />
            <ToggleRow
              title="High-value lead detection"
              description="Alert when premium leads are detected."
              value={settings.highValueLeads}
              onToggle={() => updateSetting('highValueLeads', !settings.highValueLeads)}
            />
            <ToggleRow
              title="Performance analytics email"
              description="Weekly performance report."
              value={settings.performanceAnalytics}
              onToggle={() => updateSetting('performanceAnalytics', !settings.performanceAnalytics)}
            />
          </SurfaceSection>

          <section className="rounded-[24px] border border-red-500/20 bg-red-500/5 p-6">
            <div className="mb-4 flex items-center gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-red-500" />
              <h3 className="text-[13px] font-bold uppercase tracking-[0.16em] text-red-500">Danger zone</h3>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="max-w-lg text-[12px] leading-6 text-[var(--text-secondary)]">
                Clearing local cache will remove saved session data and disconnect WhatsApp. This action cannot be
                undone.
              </p>
              <button className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-red-500 transition-colors hover:bg-red-500 hover:text-black">
              <TrashIcon className="h-4 w-4" />
                Purge all data
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
