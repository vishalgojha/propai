"use client";

import React from 'react';
import { Check, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from '../lib/router';
import { acceptSyndicationInvite } from '../services/syndicationApi';
import { handleApiError } from '../services/api';

export const SyndicationAccept: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const [status, setStatus] = React.useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = React.useState(token ? 'Accepting partner invite...' : 'Syndication token is missing.');

  React.useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await acceptSyndicationInvite(token);
        if (cancelled) return;
        setStatus('success');
        setMessage(`Connected with ${result.partnerName}.`);
        window.setTimeout(() => {
          if (!cancelled) navigate('/broker-network?tab=partners', { replace: true });
        }, 1200);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(handleApiError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  const Icon = status === 'loading' ? Loader2 : status === 'success' ? Check : XCircle;

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center px-4">
      <div className="w-full rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]">
          {status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Broker syndication
        </div>
        <h1 className="mt-4 text-[24px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
          {status === 'success' ? 'Partner connected' : status === 'error' ? 'Invite could not be accepted' : 'Accepting invite'}
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{message}</p>
        {status === 'error' ? (
          <button
            type="button"
            onClick={() => navigate('/broker-network?tab=partners', { replace: true })}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-all hover:brightness-95"
          >
            Open partners
          </button>
        ) : null}
      </div>
    </div>
  );
};
