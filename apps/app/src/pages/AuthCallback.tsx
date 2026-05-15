import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildSessionFromSupabase } from '../services/authSession';

function decodeBase64Url(value: string) {
  let normalized = '';
  for (const c of value) {
    if (c === '-') normalized += '+';
    else if (c === '_') normalized += '/';
    else normalized += c;
  }
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function getTokenPayload(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}

export const AuthCallback: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Restoring your session...');
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(window.location.search);
    return {
      accessToken: hashParams.get('access_token') || queryParams.get('access_token'),
      refreshToken: hashParams.get('refresh_token') || queryParams.get('refresh_token'),
      email: hashParams.get('email') || queryParams.get('email'),
      expiresAt: hashParams.get('expires_at') || queryParams.get('expires_at'),
      next: queryParams.get('next'),
    };
  }, []);

  const nextPath = useMemo(() => {
    const next = params.next;
    return next && next.startsWith('/') ? next : '/agent';
  }, [params.next]);

  useEffect(() => {
    const token = params.accessToken;
    if (!token) {
      setError('Missing sign-in token.');
      return;
    }

    const payload = getTokenPayload(token);
    const email =
      params.email ||
      payload?.email ||
      payload?.user_metadata?.email ||
      payload?.phone ||
      'user@propai.live';

    try {
      login(
        email,
        buildSessionFromSupabase(email, {
          access_token: token,
          refresh_token: params.refreshToken || undefined,
          expires_at: params.expiresAt ? Number(params.expiresAt) : undefined,
        }),
        true,
      );
      setMessage('Session restored successfully. Redirecting...');
      window.setTimeout(() => {
        navigate(nextPath, { replace: true });
      }, 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sign in.');
    }
  }, [login, navigate, nextPath, params.accessToken, params.email, params.next, params.refreshToken, params.expiresAt]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">PropAI Pulse</p>
            <h1 className="text-[18px] font-bold text-[var(--text-primary)]">Session restore</h1>
          </div>
        </div>

        <div className="mt-6 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
          {error ? (
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-[var(--red)]">Could not restore session</p>
              <p className="text-[12px] leading-5 text-[var(--text-secondary)]">{error}</p>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[var(--accent)]" />
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{message}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                  {params.refreshToken ? 'Refreshing session securely in the browser.' : 'Restoring your session securely.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>Redirecting to your broker workspace</span>
        </div>
      </div>
    </div>
  );
};
