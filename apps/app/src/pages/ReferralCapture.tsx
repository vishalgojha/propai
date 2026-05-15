import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

const REFERRAL_STORAGE_KEY = 'propai.referral_code';

export const ReferralCapture: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [message, setMessage] = React.useState('Checking referral link...');

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const normalized = String(code || '').trim().toUpperCase();
      if (!normalized) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        const response = await backendApi.get(ENDPOINTS.auth.referralPreview(normalized));
        const referral = response.data?.referral;
        if (!cancelled) {
          window.localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
          setMessage(referral?.fullName ? `Referral applied from ${referral.fullName}. Redirecting...` : 'Referral applied. Redirecting...');
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(handleApiError(error));
          window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
        }
      } finally {
        window.setTimeout(() => {
          if (!cancelled) {
            navigate(`/login?ref=${encodeURIComponent(normalized)}`, { replace: true });
          }
        }, 900);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-6 text-[var(--text-primary)]">
      <div className="max-w-md rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-6 py-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">PropAI Referral</p>
        <p className="mt-3 text-[14px] leading-6 text-[var(--text-primary)]">{message}</p>
      </div>
    </div>
  );
};
