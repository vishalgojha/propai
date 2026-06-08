import React, { useState, useEffect, useCallback } from 'react';
import { CheckIcon, LoaderIcon, AlertTriangleIcon, LinkIcon, TrashIcon } from '../lib/icons';
import backendApi, { handleApiError } from '../services/api';
import { cn } from '../lib/utils';

declare global {
    interface Window {
        fbAsyncInit?: () => void;
        FB?: {
            init: (config: { appId: string; version: string; cookie: boolean }) => void;
            login: (callback: (response: { authResponse?: { accessToken: string } }) => void, options: { scope: string; extras: { feature: string } }) => void;
        };
    }
}

type WabaCredential = {
    id: string;
    businessAccountId: string;
    businessAccountName: string;
    phoneNumberId: string;
    phoneNumber: string;
    phoneNumberVerified: boolean;
    tokenExpiresAt: string | null;
    isTokenExpired: boolean;
    lastSyncAt: string | null;
    syncError: string | null;
    createdAt: string;
};

function loadFacebookSdk(appId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (window.FB) {
            resolve();
            return;
        }

        window.fbAsyncInit = () => {
            window.FB?.init({
                appId,
                version: 'v20.0',
                cookie: true,
            });
            resolve();
        };

        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('Failed to load Facebook SDK'));
        document.head.appendChild(script);
    });
}

export function WabaEmbeddedSignup({ metaAppId }: { metaAppId: string }) {
    const [credentials, setCredentials] = useState<WabaCredential[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [sdkLoaded, setSdkLoaded] = useState(false);

    const fetchCredentials = useCallback(async () => {
        try {
            const response = await backendApi.get('/waba/credentials');
            setCredentials(response.data || []);
        } catch (err) {
            console.error('Failed to load WABA credentials:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    useEffect(() => {
        if (metaAppId) {
            loadFacebookSdk(metaAppId)
                .then(() => setSdkLoaded(true))
                .catch((err) => console.error('Facebook SDK load failed:', err));
        }
    }, [metaAppId]);

    const handleConnect = async () => {
        if (!window.FB) {
            setError('Facebook SDK not loaded. Please refresh and try again.');
            return;
        }

        setConnecting(true);
        setError(null);
        setSuccess(null);

        try {
            window.FB.login((response) => {
                if (!response.authResponse?.accessToken) {
                    setError('Authorization cancelled. Please try again.');
                    setConnecting(false);
                    return;
                }

                // Send token to backend for exchange + discovery
                backendApi.post('/waba/exchange-token', {
                    shortLivedToken: response.authResponse!.accessToken,
                    metaAppId,
                })
                    .then((result) => {
                        setSuccess(result.data.message || 'Successfully connected WhatsApp account');
                        fetchCredentials();
                    })
                    .catch((err) => {
                        const message = handleApiError(err);
                        if (message.includes('No WhatsApp Business Accounts found')) {
                            setError('No WhatsApp Business Accounts found. Ensure your Meta app has "Facebook Login for Business" use case enabled and is linked to a verified Business Manager.');
                        } else {
                            setError(message);
                        }
                    })
                    .finally(() => setConnecting(false));
            }, {
                scope: 'business_management,whatsapp_business_management,whatsapp_business_messaging',
                extras: { feature: 'whatsapp_embedded_signup' },
            });
        } catch (err) {
            setError(handleApiError(err));
            setConnecting(false);
        }
    };

    const handleDisconnect = async (phoneNumberId: string) => {
        try {
            await backendApi.delete(`/waba/credentials/${phoneNumberId}`);
            setSuccess('Account disconnected');
            fetchCredentials();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <LoaderIcon className="h-5 w-5 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Connect Button */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
                <div>
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">Connect Official WhatsApp Account</p>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                        One-click import via Meta Embedded Signup. No manual ID copy-paste needed.
                    </p>
                    {!sdkLoaded && (
                        <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                            Loading Facebook SDK...
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting || !sdkLoaded}
                    className="inline-flex items-center gap-2 rounded-full bg-[#1877F2] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#166FE5] transition-all disabled:opacity-40"
                >
                    {connecting ? (
                        <LoaderIcon className="h-4 w-4 animate-spin" />
                    ) : (
                        <LinkIcon className="h-4 w-4" />
                    )}
                    {connecting ? 'Connecting...' : 'Import Account'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-start gap-3 rounded-[14px] bg-red-500/10 px-4 py-3 border border-red-500/20">
                    <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[12px] text-red-200">{error}</p>
                        {error.includes('Facebook Login for Business') && (
                            <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                                Fix: Meta Developer Console → Your App → App Review → Use Cases → Add "Facebook Login for Business" → Submit for approval.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Success */}
            {success && (
                <div className="rounded-[14px] bg-[var(--accent-dim)] px-4 py-3 text-[12px] text-[var(--accent)] border border-[color:var(--accent-border)]">
                    {success}
                </div>
            )}

            {/* Connected Accounts */}
            {credentials.length > 0 ? (
                <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                        Connected accounts ({credentials.length})
                    </p>
                    {credentials.map((cred) => (
                        <div
                            key={cred.phoneNumberId}
                            className="flex items-center justify-between gap-4 rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-5 py-4"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[13px] font-bold text-[var(--accent)]">
                                    {cred.businessAccountName?.[0]?.toUpperCase() || 'W'}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                                        {cred.businessAccountName || 'WhatsApp Business'}
                                    </p>
                                    <p className="text-[10px] text-[var(--text-muted)]">
                                        {cred.phoneNumber}
                                        <span className="mx-1.5">·</span>
                                        {cred.phoneNumberVerified ? (
                                            <span className="text-[var(--accent)]">Verified</span>
                                        ) : (
                                            <span className="text-[var(--text-muted)]">Pending</span>
                                        )}
                                    </p>
                                    {cred.lastSyncAt && (
                                        <p className="text-[9px] text-[var(--text-muted)]">
                                            Last synced: {new Date(cred.lastSyncAt).toLocaleString('en-IN')}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[9px] font-mono text-[var(--text-muted)] truncate max-w-[120px]">
                                    ID: {cred.phoneNumberId.slice(-8)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleDisconnect(cred.phoneNumberId)}
                                    className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-red-500 hover:bg-red-500 hover:text-black transition-all"
                                >
                                    <TrashIcon className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-[16px] border border-dashed border-[color:var(--border)] px-4 py-10 text-center">
                    <LinkIcon className="mx-auto h-8 w-8 mb-3 opacity-40 text-[var(--text-muted)]" />
                    <p className="text-[13px] text-[var(--text-secondary)]">No official WhatsApp accounts connected.</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">Import your WABA via Meta Embedded Signup above.</p>
                </div>
            )}
        </div>
    );
}
