import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LegalFooter } from '../components/LegalFooter';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { buildSessionFromSupabase } from '../services/authSession';
import { track } from '../services/analytics';
import { cn } from '../lib/utils';
import { PROPAI_ASSISTANT_NUMBER, PROPAI_ASSISTANT_WA_LINK } from '../lib/propai';
import { buildFullName } from '../lib/names';
import { backendApiUrl } from '../services/apiBase';
import { deleteCookie, readCookie, writeCookie } from '../services/browserCookies';
import {
  ArrowRightIcon,
  ActivityIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  FollowUpIcon,
  LoaderIcon,
  ListingIcon,
  MailIcon,
  MessageSquareTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from '../lib/icons';
import { AuthCard } from '../components/ui/AuthCard';

const capabilities = [
  {
    icon: MessageSquareTextIcon,
    title: 'WhatsApp intake',
    copy: 'Keep group messages in one place.',
  },
  {
    icon: WorkflowIcon,
    title: 'Parsed stream',
    copy: 'Listings and requirements are structured automatically.',
  },
  {
    icon: FollowUpIcon,
    title: 'Follow-up',
    copy: 'Track callbacks and next actions.',
  },
  {
    icon: SearchIcon,
    title: 'Shared workspace',
    copy: 'Work solo or with a team on the same workspace.',
  },
];

const proofPoints = [
  { label: 'Setup', value: '<5 min' },
  { label: 'Workflows', value: '8+' },
  { label: 'Device', value: '1 per account' },
];

const fallback = ['3BHK Bandra West 1.8Cr sale, owner direct', '2BHK Powai requirement, budget 70 lakh', 'Remind me to call Rahul tomorrow 10am', 'Show me hot leads from this week'];
const CACHE_KEY = 'propai.examplePrompts.v2';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function useExamplePrompts(): string[] {
  const [prompts, setPrompts] = useState<string[]>([]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.prompts) && parsed.expiry > Date.now()) {
          setPrompts(parsed.prompts);
          return;
        }
      }
    } catch { /* ignore */ }

    if (!backendApiUrl) return;
    fetch(`${backendApiUrl}/example-prompts`, { signal: AbortSignal.timeout?.(5000) ?? undefined })
      .then((r) => r.json())
      .then((data) => {
        if (data?.prompts?.length === 4) {
          setPrompts(data.prompts);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ prompts: data.prompts, expiry: Date.now() + CACHE_TTL })); } catch { /* ignore */ }
        } else {
          setPrompts(fallback);
        }
      })
      .catch(() => setPrompts(fallback));
  }, []);

  return prompts.length === 4 ? prompts : fallback;
}

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
]);

const authPrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] shadow-[0_10px_28px_rgba(62,232,138,0.18)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-95 disabled:opacity-50 disabled:hover:translate-y-0';
const authSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const authPill =
  'inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]';
const authFieldClassName =
  'w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] py-3 px-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 focus:border-[color:var(--accent)] focus:bg-[var(--bg-hover)]';
const REFERRAL_STORAGE_KEY = 'propai.referral_code';
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const resolveAppRole = (email?: string | null, appRole?: string) => {
  if (appRole === 'super_admin') {
    return appRole;
  }

  return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase()) ? 'super_admin' : appRole || 'broker';
};

async function attemptBrowserPasswordSignIn(email: string, password: string) {
  const { createSupabaseBrowserClient, isSupabaseBrowserConfigured } = await import('../services/supabaseBrowser');
  if (!isSupabaseBrowserConfigured) {
    throw new Error('Browser Supabase auth is not configured on this build.');
  }

  const client = createSupabaseBrowserClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (!data.session?.access_token || !data.user?.id) {
    throw new Error('Supabase sign-in did not return a valid session.');
  }

  return data;
}

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralLabel, setReferralLabel] = useState('');
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const exPromptList = useExamplePrompts();

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    return next && next.startsWith('/') ? next : '/agent';
  }, [location.search]);

  useEffect(() => {
    if (!isLoading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [isLoading, navigate, nextPath, user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextCode = String(params.get('ref') || readCookie(REFERRAL_STORAGE_KEY) || '').trim().toUpperCase();
    if (!nextCode) {
      setReferralCode('');
      setReferralLabel('');
      return;
    }

    writeCookie(REFERRAL_STORAGE_KEY, nextCode, { maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS });
    setReferralCode(nextCode);
    setReferralLabel(`Referral code applied: ${nextCode}`);
    setMode('signup');
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    const checkApi = async () => {
      try {
        const base = backendApi.defaults.baseURL || '/api';
        const healthUrl = base.endsWith('/api') ? `${base.slice(0, -4)}/health` : `${base}/health`;
        const response = await fetch(healthUrl);
        if (!cancelled) {
          setApiStatus(response.ok ? 'online' : 'offline');
        }
      } catch {
        if (!cancelled) {
          setApiStatus('offline');
        }
      }
    };

    checkApi();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const normalizedEmail = email.trim();

    try {
      const fullName = buildFullName(firstName, lastName);
      if (mode === 'signup' && (!firstName.trim() || !lastName.trim())) {
        setError('First name and last name are required.');
        setIsLoading(false);
        return;
      }

      const response = await backendApi.post(ENDPOINTS.auth.password, {
        mode,
        email: normalizedEmail,
        password,
        fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phoneNumber,
        referralCode: mode === 'signup' ? referralCode || undefined : undefined,
      });
      const session = response.data?.session;
      if (response.data.success && session?.access_token) {
        login(
          response.data?.user?.email || normalizedEmail,
          {
            ...buildSessionFromSupabase(response.data?.user?.email || normalizedEmail, session),
            id: response.data?.user?.id,
            appRole: resolveAppRole(
              response.data?.user?.email || normalizedEmail,
              response.data?.profile?.appRole || response.data?.user?.appRole
            ),
            subscription: response.data?.subscription,
            referral: response.data?.referral || null,
          },
          rememberMe,
        );
        if (mode === 'signup') {
          deleteCookie(REFERRAL_STORAGE_KEY);
          setReferralCode('');
          setReferralLabel('');
        }
        track(mode === 'signup' ? 'signup_success' : 'signin_success', {
          remember: rememberMe,
          has_email: Boolean(response.data?.user?.email || email),
        });
        navigate(nextPath, { replace: true });
      } else {
        track(mode === 'signup' ? 'signup_failed' : 'signin_failed');
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      track(mode === 'signup' ? 'signup_error' : 'signin_error');
      const message = handleApiError(err);
      if ((err as any)?.response?.status === 409 || message.toLowerCase().includes('no broker profile exists yet')) {
        setMode('signup');
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError(null);
    setResetSent(false);

    try {
      await backendApi.post(ENDPOINTS.auth.resetPassword, {
        email: resetEmail || email,
      });
      setResetSent(true);
    } catch (err) {
      setResetError(handleApiError(err));
    } finally {
      setResetLoading(false);
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
              <span>Email login | Stream | Follow-up</span>
              <span className={cn('ml-2', authPill)}>
                <span className={apiStatus === 'online' ? 'h-2 w-2 rounded-full bg-[var(--accent)]' : apiStatus === 'offline' ? 'h-2 w-2 rounded-full bg-[var(--red)]' : 'h-2 w-2 rounded-full bg-[var(--amber)]'} />
                {apiStatus === 'online' ? 'API connected' : apiStatus === 'offline' ? 'API offline' : 'Checking API'}
              </span>
            </div>
          </AuthCard>

          {user && (
            <AuthCard className="mb-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Session active</p>
                <p className="text-[12px] text-[var(--text-primary)]">{user.email}</p>
                <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                  This device already has an active session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setPassword('');
                  setFirstName('');
                  setLastName('');
                  setPhoneNumber('');
                  setMode('signin');
                }}
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
                  WhatsApp workspace
                </div>

                <div className="mt-6 max-w-3xl">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">PropAI Pulse</p>
                  <h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl md:text-5xl">
                    Sign in to
                    <span className="block text-[var(--accent)]">PropAI Pulse.</span>
                  </h1>
                  <p className="mt-5 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                    Open your workspace, stream, and follow-up tools.
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
                {capabilities.map((item, index) => (
                  <div key={item.title}>
                    <AuthCard className="p-5 transition-all duration-150 hover:-translate-y-[1px] hover:border-[color:var(--border-strong)]">
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
                  </div>
                ))}
              </div>

              <AuthCard className="p-5">
                <div className="flex items-center gap-2">
              <MessageSquareTextIcon className="h-4 w-4 text-[var(--accent)]" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Example prompts</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {exPromptList.map((item) => (
                    <div
                      key={item}
                      className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </AuthCard>

              <AuthCard className="p-5 md:p-6">
                <div className="flex items-center gap-2">
                  <WorkflowIcon className="h-4 w-4 text-[var(--accent)]" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Help</p>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="rounded-[14px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.015)] p-4">
                    <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Need help setting up?</h2>
                    <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[var(--text-secondary)]">
                      Message the PropAI Assistant on WhatsApp at {PROPAI_ASSISTANT_NUMBER}.
                    </p>
                    <a href={PROPAI_ASSISTANT_WA_LINK} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#020f07]">
                      Open WhatsApp
                    </a>
                  </div>
                </div>
              </AuthCard>
            </section>

            <aside className="order-1 lg:order-2 lg:sticky lg:top-8">
              <AuthCard variant="accent" className="p-6">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              <MailIcon className="h-3.5 w-3.5" />
                  Account access
                </div>
                <div className="mb-5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Access PropAI Pulse</p>
                  <h2 className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
                    {mode === 'signup' ? 'Create your partner account' : 'Sign in with email and password'}
                  </h2>
                  <p className="mt-2 max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]">
                    {mode === 'signup'
                      ? 'Add your name, WhatsApp number, email, and password once.'
                      : 'Sign in to open your workspace.'}
                  </p>
                </div>

                {referralLabel ? (
                  <div className="mb-5 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Referral applied</p>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--text-primary)]">{referralLabel}</p>
                  </div>
                ) : null}

                <div className="mb-5 grid grid-cols-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                    }}
                    className={cn(
                      'rounded-[10px] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      mode === 'signin'
                        ? 'bg-[var(--accent)] text-[#020f07]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                    }}
                    className={cn(
                      'rounded-[10px] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      mode === 'signup'
                        ? 'bg-[var(--accent)] text-[#020f07]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    Create account
                  </button>
                </div>

                {mode === 'signin' ? (
                    <div key="signin-form">
                      <form onSubmit={handlePasswordAuth} className="space-y-4">
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                            Email address
                          </span>
                          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                              type="email"
                              required
                              autoComplete="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="you@agency.com"
                              className={cn(authFieldClassName, 'pl-9')}
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                            Password
                          </span>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              autoComplete="current-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter password"
                              className={cn(authFieldClassName, 'pr-11')}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((current) => !current)}
                              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[color:var(--accent-border)] hover:text-[var(--text-primary)]"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                            </button>
                          </div>
                        </label>

                        <div className="flex items-center justify-between">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={rememberMe}
                              onChange={(e) => setRememberMe(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-[color:var(--border-strong)] bg-[var(--bg-base)] text-[var(--accent)] accent-[var(--accent)]"
                            />
                            <span className="text-[12px] font-medium text-[var(--text-secondary)]">Remember me</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(true);
                              setResetEmail(email);
                              setResetSent(false);
                              setResetError(null);
                            }}
                            className="text-[12px] font-medium text-[var(--accent)] transition-colors hover:underline"
                          >
                            Forgot password?
                          </button>
                        </div>

                        {error && (
                          <div className="rounded-[6px] border-[0.5px] border-[color:rgba(239,68,68,0.2)] bg-[var(--red-dim)] px-3 py-2 text-[12px] text-[var(--red)]">
                            {error}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isLoading}
                          className={cn(authPrimaryButton, 'w-full')}
                        >
            {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ArrowRightIcon className="h-4 w-4" strokeWidth={2} />}
                          <span>Sign in</span>
                        </button>
                      </form>

                      <div className="mt-5 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-4">
                        <div className="flex items-center gap-2">
            <CheckIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">No tool names needed</p>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--text-primary)]">
                          Use this if your account is already set up. New brokers can switch to Create account.
                          
                        </p>
                      </div>


                      {showForgotPassword && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowForgotPassword(false)}>
                          <div
                            className="w-full max-w-md rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-base)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="mb-4 flex items-center justify-between">
                              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Reset your password</h3>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowForgotPassword(false);
                                  setResetSent(false);
                                  setResetError(null);
                                }}
                                className="rounded-[6px] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {resetSent ? (
                              <div className="space-y-3">
                                <div className="rounded-[8px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-4 text-[12px] text-[var(--accent)]">
                                  Reset link sent! Check your email for a password reset link. The link will redirect you to set a new password.
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowForgotPassword(false);
                                    setResetSent(false);
                                  }}
                                  className={cn(authSecondaryButton, 'w-full')}
                                >
                                  Back to sign in
                                </button>
                              </div>
                            ) : (
                              <form onSubmit={handleForgotPassword} className="space-y-4">
                                <p className="text-[12px] text-[var(--text-secondary)]">
                                  Enter your email address and we will send you a password reset link.
                                </p>
                                <label className="block">
                                  <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                                    Email address
                                  </span>
                                  <div className="relative">
                                    <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                      type="email"
                                      required
                                      value={resetEmail}
                                      onChange={(e) => setResetEmail(e.target.value)}
                                      placeholder="you@agency.com"
                                      className={cn(authFieldClassName, 'pl-9')}
                                    />
                                  </div>
                                </label>

                                {resetError && (
                                  <div className="rounded-[6px] border-[0.5px] border-[color:rgba(239,68,68,0.2)] bg-[var(--red-dim)] px-3 py-2 text-[12px] text-[var(--red)]">
                                    {resetError}
                                  </div>
                                )}

                                <button
                                  type="submit"
                                  disabled={resetLoading}
                                  className={cn(authPrimaryButton, 'w-full')}
                                >
                                  {resetLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ArrowRightIcon className="h-4 w-4" strokeWidth={2} />}
                                  <span>Send reset link</span>
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key="signup-form">
                      <form onSubmit={handlePasswordAuth} className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                              First name
                            </span>
                            <input
                              type="text"
                              required
                              autoComplete="given-name"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              placeholder="First name"
                              className={authFieldClassName}
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                              Last name
                            </span>
                            <input
                              type="text"
                              required
                              autoComplete="family-name"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              placeholder="Last name"
                              className={authFieldClassName}
                            />
                          </label>
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                            WhatsApp number
                          </span>
                          <input
                            type="tel"
                            required
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.split('').filter(c => c >= '0' && c <= '9').join(''))}
                            placeholder="919876543210"
                            className={authFieldClassName}
                          />
                          <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                            Type digits only with country code. Example: <span className="text-[var(--text-primary)]">919876543210</span>
                          </p>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                            Email address
                          </span>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@agency.com"
                            className={authFieldClassName}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                            Password
                          </span>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              minLength={8}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Create a password"
                              className={cn(authFieldClassName, 'pr-11')}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((current) => !current)}
                              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[color:var(--accent-border)] hover:text-[var(--text-primary)]"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
          {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                            </button>
                          </div>
                        </label>

                        {referralCode ? (
                          <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[11px] text-[var(--text-secondary)]">
                            Referral link applied. When you complete trial and payment, your referrer gets credit.
                          </div>
                        ) : null}

                        {error && (
                          <div className="rounded-[6px] border-[0.5px] border-[color:rgba(239,68,68,0.2)] bg-[var(--red-dim)] px-3 py-2 text-[12px] text-[var(--red)]">
                            {error}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isLoading}
                          className={cn(authPrimaryButton, 'w-full')}
                        >
          {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : 'Create account'}
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => {
                          setMode('signin');
                          setError(null);
                        }}
                        className={cn(authSecondaryButton, 'mt-3 w-full')}
                      >
                        I already have an account
                      </button>
                    </div>
                  )}
              </AuthCard>

              <AuthCard className="mt-4 p-4">
                <div className="flex items-center gap-2">
              <ListingIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Workspace capability reminder</p>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                  After login you can work in Threads, Stream, and follow-up.
                </p>
              </AuthCard>
            </aside>
          </div>
        </div>
      </div>
      <LegalFooter className="border-t-0 bg-[#000000]" />
    </div>
  );
};
