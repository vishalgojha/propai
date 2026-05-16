import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LegalFooter } from '../components/LegalFooter';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { buildSessionFromSupabase } from '../services/authSession';
import { track } from '../services/analytics';
import { cn } from '../lib/utils';
import { PROPAI_ASSISTANT_NUMBER, PROPAI_ASSISTANT_WA_LINK, PROPAI_PLAN_CARDS } from '../lib/propai';
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
    title: 'Never lose a hot deal again',
    copy: 'Pulse reads every WhatsApp group message and flags listings and requirements before you can scroll past them.',
  },
  {
    icon: WorkflowIcon,
    title: 'Your pipeline runs itself',
    copy: 'Tell Pulse what you heard — it files the listing, creates the follow-up, and routes the match. Zero manual entry.',
  },
  {
    icon: FollowUpIcon,
    title: 'Follow up before it goes cold',
    copy: 'Pulse queues reminders, tracks hot leads by urgency, and tells you exactly who to call next.',
  },
  {
    icon: SearchIcon,
    title: 'Find the match in seconds',
    copy: 'Describe what the buyer wants in plain language. Pulse searches your entire inventory and returns the right unit.',
  },
];

const proofPoints = [
  { label: 'Built for real estate partners', value: '100%' },
  { label: 'Workflows automated', value: '8+' },
  { label: 'Setup time', value: '<5 min' },
];

const examples = [
  '3BHK Bandra West 1.8Cr sale, owner direct',
  '2BHK Powai requirement, budget 70 lakh',
  'Remind me to call Rahul tomorrow 10am',
  'Show me hot leads from this week',
];

const demoConversation = [
  {
    role: 'user',
    text: '3BHK Bandra West 1.8Cr, ready possession, owner direct',
    timestamp: 'Now',
  },
  {
    role: 'ai',
    text: 'Saved as listing. Found 2 buyer matches in your pipeline — Rahul (budget 1.5–2Cr, Bandra) and Priya (ready possession, West Mumbai). Want me to draft follow-up messages for both?',
    timestamp: 'Now',
  },
  {
    role: 'user',
    text: 'Yes. And remind me to call Rahul tomorrow at 10am',
    timestamp: 'Now',
  },
  {
    role: 'ai',
    text: 'Done. Reminder set for 10am. I drafted a WhatsApp message for Rahul highlighting the Bandra West unit and ready possession — review it in Inbox before sending.',
    timestamp: 'Now',
  },
];

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

const resolveAppRole = (email?: string | null, appRole?: string) => {
  if (appRole === 'super_admin') {
    return appRole;
  }

  return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase()) ? 'super_admin' : appRole || 'broker';
};

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [demoIndex, setDemoIndex] = useState(0);
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

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    return next && next.startsWith('/') ? next : '/agent';
  }, [location.search]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDemoIndex((current) => (current + 1) % (demoConversation.length + 1));
    }, 1800);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [isLoading, navigate, nextPath, user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextCode = String(params.get('ref') || window.localStorage.getItem(REFERRAL_STORAGE_KEY) || '').trim().toUpperCase();
    if (!nextCode) {
      setReferralCode('');
      setReferralLabel('');
      return;
    }

    window.localStorage.setItem(REFERRAL_STORAGE_KEY, nextCode);
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

    try {
      const response = await backendApi.post(ENDPOINTS.auth.password, {
        mode,
        email,
        password,
        fullName,
        phone: phoneNumber,
        referralCode: mode === 'signup' ? referralCode || undefined : undefined,
      });
      const session = response.data?.session;
      if (response.data.success && session?.access_token) {
        login(
          response.data?.user?.email || email,
          {
            ...buildSessionFromSupabase(response.data?.user?.email || email, session),
            appRole: resolveAppRole(
              response.data?.user?.email || email,
              response.data?.profile?.appRole || response.data?.user?.appRole
            ),
            subscription: response.data?.subscription,
            referral: response.data?.referral || null,
          },
          rememberMe,
        );
        if (mode === 'signup') {
          window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
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
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div
        className="min-h-screen"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px), radial-gradient(ellipse at top, rgba(62,232,138,0.07) 0%, transparent 60%)',
          backgroundSize: '28px 28px, 28px 28px, auto',
          backgroundPosition: 'center top',
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <AuthCard className="mb-6 flex flex-col items-start justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] shadow-[0_0_0_1px_rgba(62,232,138,0.08)]">
                <ActivityIcon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[13px] font-bold tracking-[0.06em]">PROPAI PULSE</p>
                <p className="text-[11px] text-[var(--text-secondary)]">Your AI partner for real estate</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              <span>Email login | Tool-calling | Lead ops</span>
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
                  Remembered on this device. Pulse will open the workspace when this session checks out.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setPassword('');
                  setFullName('');
                  setPhoneNumber('');
                  setMode('signin');
                }}
                className={cn(authSecondaryButton, 'px-4 py-2.5 hover:border-[color:var(--red)] hover:text-[var(--red)]')}
              >
                Sign out
              </button>
            </AuthCard>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] items-start">
            <section className="order-2 space-y-6 lg:order-1">
              <AuthCard className="p-6 md:p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                  <WorkflowIcon className="h-3.5 w-3.5" />
                  No tool names. No training. Just talk.
                </div>

                <div className="mt-6 max-w-3xl">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">PropAI Pulse</p>
                  <h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl md:text-5xl">
                    The deal that slipped through
                    <span className="block text-[var(--accent)]">won't happen again.</span>
                  </h1>
                  <p className="mt-5 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                    Pulse reads your WhatsApp groups, captures every listing and requirement, matches buyers to properties, and keeps your follow-up queue moving — all in plain language, no spreadsheets.
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
                  {examples.map((item) => (
                    <div
                      key={item}
                      className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </AuthCard>

              <AuthCard className="p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="h-4 w-4 text-[var(--accent)]" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Plans and onboarding</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {PROPAI_PLAN_CARDS.map((plan) => (
                    <div key={plan.name} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">{plan.name}</p>
                      <p className="mt-2 text-[22px] font-bold text-[var(--text-primary)]">{plan.price}</p>
                      <p className="text-[12px] text-[var(--text-secondary)]">{plan.devices}</p>
                      <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{plan.blurb}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">PropAI Assistant</p>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--text-primary)]">
                    Need help onboarding? Message the PropAI Assistant on WhatsApp at {PROPAI_ASSISTANT_NUMBER}.
                  </p>
                  <a href={PROPAI_ASSISTANT_WA_LINK} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#020f07]">
                    Open WhatsApp
                  </a>
                </div>
              </AuthCard>

              <AuthCard className="p-5">
                <div className="flex items-center gap-2">
              <WorkflowIcon className="h-4 w-4 text-[var(--accent)]" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Sample conversation</p>
                </div>
                <div className="relative mt-4 h-[320px] overflow-hidden rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)]">
                  <div className="pulse-scrollbar h-full space-y-5 overflow-y-auto px-4 py-4 pr-3">
                    {demoConversation.slice(0, demoIndex).map((item, index) => {
                      const isAi = item.role === 'ai';
                      return (
                        <div key={`${item.role}-${index}`} className="group px-0">
                          <div className="flex items-start gap-3">
                            <div className="w-[12px] shrink-0 pt-[3px]">
                              {isAi ? (
                                <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
              <ActivityIcon className="h-3 w-3" />
                                  <span>Pulse</span>
                                </div>
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[10px] font-bold text-[var(--accent)]">
                                  U
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className={isAi ? 'text-[13px] leading-7 text-[var(--text-primary)]' : 'text-[13px] leading-7 text-[var(--text-secondary)]'}>
                                {item.text}
                              </p>
                            </div>

                            <div className="hidden min-w-[84px] text-right sm:block">
                              <span className="inline-block text-[10px] font-medium text-[var(--text-ghost)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                {item.timestamp}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {demoIndex === 0 ? (
                      <div className="group px-0">
                        <div className="flex items-start gap-3">
                          <div className="w-[12px] shrink-0 pt-[3px]">
                            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
              <ActivityIcon className="h-3 w-3" />
                              <span>Pulse</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-7 text-[var(--text-secondary)]">
                              Pulse captures the listing, finds matching buyers in your pipeline, and queues the follow-up — watch it happen.
                            </p>
                          </div>
                          <div className="hidden min-w-[84px] text-right sm:block">
                            <span className="inline-block text-[10px] font-medium text-[var(--text-ghost)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                              Now
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2 pt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] opacity-70" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] opacity-40" />
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {demoIndex === demoConversation.length ? 'Looping demo' : 'Auto-playing capability demo'}
                      </span>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent" />
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
                      ? 'New partners add their name and WhatsApp number once. Returning partners sign in with email and password.'
                      : 'Sign in to start the agent. First time here? Switch to Create account and get set up in under 5 minutes.'}
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
                          Use this if your account is already set up. New partners can switch to Create account.
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
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                            Full name
                          </span>
                          <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Your full name"
                            className={authFieldClassName}
                          />
                        </label>

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
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Pulse capability reminder</p>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                  After login, Pulse keeps coaching you with examples like add listing, save requirement, schedule follow-up, and check the queue. No manual entry, no spreadsheets.
                </p>
              </AuthCard>
            </aside>
          </div>
        </div>
      </div>
      <LegalFooter className="border-t-0 bg-[transparent]" />
    </div>
  );
};
