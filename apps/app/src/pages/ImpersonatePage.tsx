import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

/**
 * Landing page for /impersonate?token=imp_xxx
 * Resolves the token, stores the impersonation session, redirects to /dashboard.
 */
export const ImpersonatePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [status, setStatus] = React.useState<'resolving' | 'error'>('resolving');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = searchParams.get('token');
    if (!token || !token.startsWith('imp_')) {
      setStatus('error');
      setErrorMsg('Invalid or missing impersonation token.');
      return;
    }

    const resolve = async () => {
      try {
        const res = await backendApi.get(ENDPOINTS.admin.resolveImpersonation(token));
        const data = res.data;
        if (!data.success) throw new Error('Token resolution failed');

        // Store impersonation session in the auth context using the token directly as bearer
        login(data.partnerEmail, {
          token: token,
          email: data.partnerEmail,
          fullName: data.partnerFullName || '',
          appRole: data.partnerRole,
          isImpersonation: true,
          impersonatedBy: data.adminEmail,
          impersonationExpiresAt: data.expiresAt,
          subscription: null,
        }, false /* don't persist impersonation to localStorage */);

        navigate('/agent', { replace: true });
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err?.response?.data?.error || 'Failed to resolve impersonation token. It may have expired.');
      }
    };

    void resolve();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8 text-center"
      >
        {status === 'resolving' ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-[color:var(--accent-border)] border-t-[var(--accent)] animate-spin" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Opening workspace…</p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Validating admin access token</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-lg">✕</div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Access failed</p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{errorMsg}</p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-5 w-full rounded-[8px] bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-[#020f07]"
            >
              Back to login
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};
