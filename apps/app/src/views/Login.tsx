import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import backendApi, { handleApiError } from '../services/api';
import { backendApiUrl } from '../services/apiBase';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import {
  ActivityIcon,
  CheckIcon,
  LoaderIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
  WorkflowIcon,
  SearchIcon,
  FollowUpIcon,
} from '../lib/icons';
import { AuthCard } from '../components/ui/AuthCard';

const proofPoints = [
  { label: 'Setup', value: '<5 min' },
  { label: 'Login method', value: 'WhatsApp link' },
  { label: 'Security', value: 'No password' },
];

const capabilities = [
  {
    icon: MessageSquareTextIcon,
    title: 'Number based',
    copy: 'Use your registered WhatsApp number to request access.',
  },
  {
    icon: WorkflowIcon,
    title: 'One-click access',
    copy: 'Open the secure login link sent to that number and you are in.',
  },
  {
    icon: FollowUpIcon,
    title: 'No OTP field',
    copy: 'There is no code to type and no password to remember.',
  },
  {
    icon: SearchIcon,
    title: 'Workspace ready',
    copy: 'The same session opens your stream, team, and follow-up tools.',
  },
];

const authPrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] shadow-[0_10px_28px_rgba(62,232,138,0.18)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-95 disabled:opacity-50 disabled:hover:translate-y-0';
const authSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const authFieldClassName =
  'w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] py-3 px-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 focus:border-[color:var(--accent)] focus:bg-[var(--bg-hover)]';

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `91${digits.slice(1)}`;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function formatPhone(value: string) {
  const normalized = normalizeIndianPhone(value);
  if (!normalized) return '';
  if (normalized.startsWith('91') && normalized.length === 12) {
    return `+${normalized}`;
  }
  return normalized;
}

export const Login: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'degraded' | 'offline'>('checking');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    return next && next.startsWith('/') ? next : '/onboarding';
  }, [location.search]);

  useEffect(() => {
    if (user) {
      navigate(nextPath, { replace: true });
    }
  }, [navigate, nextPath, user]);

  useEffect(() => {
    let cancelled = false;

    const checkApi = async () => {
      const apiRoot = backendApiUrl.replace(/\/api$/, '');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${apiRoot}/health`, {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          if (response.ok) {
            setApiStatus('online');
          } else if (response.status >= 500 && response.status < 600) {
            setApiStatus('degraded');
          } else {
            setApiStatus('offline');
          }
          if (payload?.status === 'degraded' && !response.ok) {
            setApiStatus('degraded');
          }
        }
      } catch {
        if (!cancelled) {
          setApiStatus('offline');
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };

    checkApi();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSendLoginLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSentMessage(null);

    try {
      const normalizedPhone = normalizeIndianPhone(phoneNumber);
      if (normalizedPhone.length !== 12) {
        setError('Enter your 10-digit WhatsApp number.');
        return;
      }

      const response = await backendApi.post(ENDPOINTS.auth.requestLoginLink, {
        phone: normalizedPhone,
        next: nextPath,
      });

      if (response.data?.success) {
        setSentMessage(`Login link sent to ${formatPhone(normalizedPhone)} on WhatsApp.`);
        return;
      }

      setError('Could not send the login link. Try again.');
    } catch (err) {
      const message = handleApiError(err);
      if ((err as any)?.response?.status === 404) {
        setError('No account found for that number. Open the WhatsApp onboarding flow first.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[var(--text-primary)]">
      <div
        className="min-h-screen"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '28px 28px, 28px 28px, auto',
          backgroundPosition: 'center top',
          backgroundColor: '#000000',
        }}
      >
        <div className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 xl:px-12 py-6 lg:py-8">
          <AuthCard className="mb-6 flex flex-col items-start justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] shadow-[0_0_0_1px_rgba(62,232,138,0.08)]">
                <ActivityIcon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[13px] font-bold tracking-[0.06em]">PROPAI PULSE</p>
                <p className="text-[11px] text-[var(--text-secondary)]">WhatsApp workspace for brokers.</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              <span>Phone login | Stream | Follow-up</span>
              <span className={cn('ml-2 inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]')}>
                <span className={apiStatus === 'online' ? 'h-2 w-2 rounded-full bg-[var(--accent)]' : apiStatus === 'offline' ? 'h-2 w-2 rounded-full bg-[var(--red)]' : 'h-2 w-2 rounded-full bg-[var(--amber)]'} />
                {apiStatus === 'online' ? 'API connected' : apiStatus === 'degraded' ? 'API degraded' : apiStatus === 'offline' ? 'API offline' : 'Checking API'}
              </span>
            </div>
          </AuthCard>

          {user && (
            <AuthCard className="mb-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Session active</p>
                <p className="text-[12px] text-[var(--text-primary)]">{user.email}</p>
                <p className="mt-1 text-[10px] text-[var(--text-secondary)]">This browser already has an active session.</p>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className={cn(authSecondaryButton, 'px-4 py-2.5 hover:border-[color:var(--red)] hover:text-[var(--red)]')}
              >
                Sign out
              </button>
            </AuthCard>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr] items-start">
            <section className="order-2 space-y-6 lg:order-1">
              <AuthCard className="p-6 md:p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                  <WorkflowIcon className="h-3.5 w-3.5" />
                  Secure WhatsApp login
                </div>

                <div className="mt-6 max-w-3xl">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">PropAI Pulse</p>
                  <h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl md:text-5xl">
                    Sign in with
                    <span className="block text-[var(--accent)]">your WhatsApp number.</span>
                  </h1>
                  <p className="mt-5 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                    No password. No OTP screen. We send a secure login link to the number on file and the link restores your session in the browser.
                  </p>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {proofPoints.map((item) => (
                    <AuthCard key={item.label} variant="elevated" className="p-4">
                      <p className="text-[28px] font-bold leading-none tracking-[-0.02em] text-[var(--text-primary)]">{item.value}</p>
                      <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{item.label}</p>
                    </AuthCard>
                  ))}
                </div>
              </AuthCard>

              <div className="grid gap-3 sm:grid-cols-2">
                {capabilities.map((item) => (
                  <AuthCard key={item.title} className="p-5 transition-all duration-150 hover:-translate-y-[1px] hover:border-[color:var(--border-strong)]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]">
                        <item.icon className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</h2>
                        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{item.copy}</p>
                      </div>
                    </div>
                  </AuthCard>
                ))}
              </div>

              <AuthCard className="p-5 md:p-6">
                <div className="flex items-center gap-2">
                  <WorkflowIcon className="h-4 w-4 text-[var(--accent)]" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Help</p>
                </div>
                <div className="mt-4 rounded-[14px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.015)] p-4">
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Need help setting up?</h2>
                  <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[var(--text-secondary)]">
                    Open WhatsApp onboarding first, then come back here and enter the same broker number.
                  </p>
                  <a href="/onboarding" className="mt-4 inline-flex items-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#020f07]">
                    Open onboarding
                  </a>
                </div>
              </AuthCard>
            </section>

            <aside className="order-1 lg:order-2 lg:sticky lg:top-8">
              <AuthCard variant="accent" className="p-6">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                  <MessageSquareTextIcon className="h-3.5 w-3.5" />
                  Account access
                </div>
                <div className="mb-5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Access PropAI Pulse</p>
                  <h2 className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">Send me a login link</h2>
                  <p className="mt-2 max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]">
                    Enter the 10-digit WhatsApp number on your account. We will send a one-click magic link to that chat.
                  </p>
                </div>

                <form onSubmit={handleSendLoginLink} className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      WhatsApp number
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="9876543210"
                      className={authFieldClassName}
                    />
                    <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                      We only use this number to send the login link and open your workspace session.
                    </p>
                  </label>

                  {error ? (
                    <div className="rounded-[12px] border border-[color:var(--red)]/40 bg-[rgba(255,76,76,0.08)] px-4 py-3 text-[12px] leading-5 text-[var(--text-primary)]">
                      {error}
                    </div>
                  ) : null}

                  {sentMessage ? (
                    <div className="rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[12px] leading-5 text-[var(--text-primary)]">
                      {sentMessage}
                    </div>
                  ) : null}

                  <button type="submit" disabled={isLoading} className={authPrimaryButton + ' w-full'}>
                    {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
                    Send login link
                  </button>
                </form>

                <div className="mt-5 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                  <div className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                    <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
                      The link is sent to WhatsApp and lands in your browser session without asking for a password or OTP.
                    </p>
                  </div>
                </div>
              </AuthCard>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
