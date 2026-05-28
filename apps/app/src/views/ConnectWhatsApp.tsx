import React, { useCallback, useEffect, useState } from 'react';
import {
    CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, LoaderIcon,
    PowerIcon, QrCodeIcon, RefreshIcon, SmartphoneIcon, XIcon,
} from '../lib/icons';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { buildFullName, getPreferredName, splitFullName } from '../lib/names';

type Session = {
    label: string;
    ownerName?: string | null;
    phoneNumber?: string | null;
    status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
};

type StatusData = {
    status: string;
    activeCount: number;
    limit: number;
    plan: string;
    connectedPhoneNumber?: string | null;
    connectedOwnerName?: string | null;
    sessions: Session[];
};

type ConnectionArtifact = {
    mode: 'qr' | 'pairing';
    format: 'text';
    value: string;
};

export const ConnectWhatsApp: React.FC = () => {
    const { user } = useAuth();
    const initialNames = splitFullName(getPreferredName({
        firstName: user?.first_name,
        lastName: user?.last_name,
        fullName: user?.full_name,
        email: user?.email,
    }));
    const [status, setStatus] = useState<StatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [firstName, setFirstName] = useState(initialNames.firstName);
    const [lastName, setLastName] = useState(initialNames.lastName);
    const [phone, setPhone] = useState('');
    const [artifact, setArtifact] = useState<ConnectionArtifact | null>(null);
    const [qrSvg, setQrSvg] = useState<string | null>(null);
    const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
    const [mode, setMode] = useState<'qr' | 'pairing'>('qr');
    const [activeSessionLabel, setActiveSessionLabel] = useState<string | null>(null);
    const [copyMessage, setCopyMessage] = useState<string | null>(null);

    const QR_FRESHNESS = 90;
    const ARTIFACT_POLL_ATTEMPTS = 8;
    const ARTIFACT_POLL_INTERVAL_MS = 750;

    const fetchStatus = useCallback(async () => {
        try {
            const resp = await backendApi.get(ENDPOINTS.whatsapp.status);
            setStatus(resp.data);
        } catch { }
    }, []);

    useEffect(() => {
        (async () => {
            await fetchStatus();
            try {
                const prof = await backendApi.get(ENDPOINTS.whatsapp.profile);
                const p = prof.data?.profile;
                if (p) {
                    const nextNames = splitFullName(p.fullName);
                    setFirstName((current) => current || nextNames.firstName);
                    setLastName((current) => current || nextNames.lastName);
                    setPhone((current) => current || p.phone || '');
                }
            } catch { }
            setLoading(false);
        })();
    }, [fetchStatus]);

    useEffect(() => {
        const shouldPoll = isConnecting
            || status?.status === 'connecting'
            || status?.status === 'reconnecting'
            || artifact?.mode === 'qr'
            || artifact?.mode === 'pairing';

        if (!shouldPoll) {
            return;
        }

        let cancelled = false;
        const load = async () => {
            try {
                const resp = await backendApi.get(ENDPOINTS.whatsapp.status);
                if (cancelled) return;
                const nextStatus = resp.data;
                setStatus(nextStatus);

                const connected = nextStatus?.sessions?.some((session: Session) => session.status === 'connected');
                if (connected) {
                    setArtifact(null);
                    setQrSvg(null);
                    setQrGeneratedAt(null);
                    setActiveSessionLabel(null);
                    return;
                }

                if (activeSessionLabel && artifact?.mode === 'qr') {
                    const qrResp = await backendApi.get(ENDPOINTS.whatsapp.qr, {
                        params: { label: activeSessionLabel },
                    });
                    if (cancelled) return;
                    const nextArtifact = qrResp.data?.artifact || null;
                    if (nextArtifact?.value) {
                        setArtifact(nextArtifact);
                        setQrGeneratedAt(Date.now());
                    }
                }
            } catch { }
        };

        void load();
        const interval = window.setInterval(() => {
            void load();
        }, 3000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [activeSessionLabel, artifact?.mode, isConnecting, status?.status]);

    useEffect(() => {
        if (!artifact || artifact.mode !== 'qr' || !artifact.value) {
            setQrSvg(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { default: QRCode } = await import('qrcode');
                const svg = await QRCode.toString(artifact.value, {
                    type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 420,
                    color: { dark: '#111827', light: '#ffffff' },
                });
                if (!cancelled) setQrSvg(svg);
            } catch {
                if (!cancelled) setQrSvg(null);
            }
        })();
        return () => { cancelled = true; };
    }, [artifact]);

    useEffect(() => {
        if (!qrGeneratedAt) return;
        const timer = setInterval(() => {
            if (Date.now() - qrGeneratedAt > QR_FRESHNESS * 1000) {
                setQrSvg(null);
                setArtifact(null);
                setQrGeneratedAt(null);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [qrGeneratedAt]);

    const timeLeft = qrGeneratedAt ? Math.max(0, QR_FRESHNESS - Math.floor((Date.now() - qrGeneratedAt) / 1000)) : 0;

    const handleCopyPairingCode = async () => {
        if (!artifact?.value) return;
        try {
            await navigator.clipboard.writeText(artifact.value);
            setCopyMessage('Pairing code copied');
            window.setTimeout(() => setCopyMessage(null), 1800);
        } catch {
            setCopyMessage('Copy failed');
            window.setTimeout(() => setCopyMessage(null), 1800);
        }
    };

    const waitForArtifact = useCallback(async (label: string, modeToWaitFor: 'qr' | 'pairing'): Promise<ConnectionArtifact | null> => {
        for (let attempt = 0; attempt < ARTIFACT_POLL_ATTEMPTS; attempt += 1) {
            try {
                const response = await backendApi.get(ENDPOINTS.whatsapp.qr, {
                    params: { label },
                });

                const nextArtifact = response.data?.artifact || null;
                if (nextArtifact?.value && nextArtifact.mode === modeToWaitFor) {
                    return nextArtifact;
                }

                const sessionReady = String(response.data?.message || '').toLowerCase().includes('already connected');
                if (sessionReady) {
                    return null;
                }
            } catch {
                // Keep retrying until the artifact appears or we run out of attempts.
            }

            if (attempt < ARTIFACT_POLL_ATTEMPTS - 1) {
                await new Promise((resolve) => window.setTimeout(resolve, ARTIFACT_POLL_INTERVAL_MS));
            }
        }

        return null;
    }, []);

    const submitConnect = async (options?: { force?: boolean }) => {
        const activeSession = status?.sessions?.find((s) => ['connected', 'connecting', 'reconnecting'].includes(s.status));
        if (activeSession && !options?.force) {
            setError('An active session already exists. Disconnect it first before connecting a new one.');
            return;
        }
        const normPhone = phone.replace(/\D/g, '');
        const fullName = buildFullName(firstName, lastName);
        if (!firstName.trim() || !lastName.trim() || normPhone.length < 10 || normPhone.length > 15) {
            setError('Enter your first name, last name, and 10-digit WhatsApp number.');
            return;
        }

        setIsConnecting(true);
        setError(null);
        setArtifact(null);
        setQrSvg(null);
        setQrGeneratedAt(null);

        try {
            await backendApi.post(ENDPOINTS.whatsapp.profile, { fullName, phone: normPhone });
            const resp = await backendApi.post(ENDPOINTS.whatsapp.connect, {
                phoneNumber: normPhone, ownerName: fullName, label: `device-${normPhone}`, connectMethod: mode,
            });
            setActiveSessionLabel(resp.data?.label || null);
            if (resp.data?.connected) {
                setArtifact(null);
            } else {
                const next = resp.data?.artifact || await waitForArtifact(resp.data?.label || `device-${normPhone}`, mode);
                setArtifact(next);
                setQrGeneratedAt(Date.now());
            }
            await fetchStatus();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsConnecting(false);
        }
    };

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitConnect();
    };

    const handleRefreshPairingCode = async () => {
        setMode('pairing');
        await submitConnect({ force: true });
    };

    const handleDisconnect = async () => {
        const session = status?.sessions?.find((s) => s.status === 'connected')
            || status?.sessions?.find((s) => s.status === 'connecting' || s.status === 'reconnecting')
            || status?.sessions?.[0];
        if (!session) return;
        setIsConnecting(true);
        try {
            await backendApi.post(ENDPOINTS.whatsapp.disconnect, { label: session.label });
            setArtifact(null);
            setQrSvg(null);
            setQrGeneratedAt(null);
            setActiveSessionLabel(null);
            await fetchStatus();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsConnecting(false);
        }
    };

    const handleResetSession = async () => {
        const session = status?.sessions?.find((s) => s.status === 'connected')
            || status?.sessions?.find((s) => s.status === 'connecting' || s.status === 'reconnecting')
            || status?.sessions?.[0];
        if (!session) return;
        setIsConnecting(true);
        setError(null);
        try {
            await backendApi.post(ENDPOINTS.whatsapp.reset, { label: session.label });
            setArtifact(null);
            setQrSvg(null);
            setQrGeneratedAt(null);
            setActiveSessionLabel(null);
            await fetchStatus();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsConnecting(false);
        }
    };

    const handleResetAllSessions = async () => {
        if (!window.confirm('This will wipe all WhatsApp session state for this workspace and start fresh. Continue?')) {
            return;
        }

        setIsConnecting(true);
        setError(null);
        try {
            await backendApi.post(ENDPOINTS.whatsapp.resetAll, {});
            setArtifact(null);
            setQrSvg(null);
            setQrGeneratedAt(null);
            setActiveSessionLabel(null);
            await fetchStatus();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsConnecting(false);
        }
    };

    useEffect(() => {
        if (!activeSessionLabel || isConnecting || artifact?.value) {
            return;
        }

        let cancelled = false;
        const loadArtifact = async () => {
            try {
                const next = await waitForArtifact(activeSessionLabel, mode);
                if (cancelled || !next) return;
                setArtifact(next);
                setQrGeneratedAt(Date.now());
            } catch {
                // Ignore. Status polling will keep the session updated.
            }
        };

        void loadArtifact();
        return () => {
            cancelled = true;
        };
    }, [activeSessionLabel, artifact?.value, isConnecting, mode, waitForArtifact]);

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
                <LoaderIcon className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    const connected = status?.sessions?.some((s) => s.status === 'connected');
    const connecting = status?.sessions?.some((s) => ['connecting', 'reconnecting'].includes(s.status));
    const activeSession = status?.sessions?.find((s) => ['connected', 'connecting', 'reconnecting'].includes(s.status));
    const connectingSession = status?.sessions?.find((s) => ['connecting', 'reconnecting'].includes(s.status));

    return (
        <div className="mx-auto max-w-lg py-10">
            <div className="mb-8 text-center">
                <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Connect WhatsApp</h1>
                <p className="text-[15px] text-[var(--text-secondary)]">Link your device to let Pulse read your groups</p>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                    {error}
                </div>
            )}

            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                If WhatsApp gets stuck on Connecting, use Reset stale session first. We send the crash log to hello@propai.live with the error reason so the issue can be fixed without asking you for technical details.
            </div>

            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)]">
                        <SmartphoneIcon className="h-5 w-5 text-[var(--accent)]" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Device Status</p>
                        <p className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">
                            {status?.activeCount || 0} / 1 device connected
                        </p>
                    </div>
                </div>

                {connecting && !connected && connectingSession ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
                                    <LoaderIcon className="h-4 w-4 animate-spin text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-medium text-amber-300">Session is connecting...</p>
                                    <p className="text-[12px] text-amber-400/70">
                                        {connectingSession.phoneNumber || connectingSession.label || 'Waiting for QR scan'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex w-full flex-wrap gap-2">
                            <button onClick={handleResetSession} disabled={isConnecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/30 px-4 py-3 text-[14px] font-semibold text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50">
                                <RefreshIcon className="h-4 w-4" />
                                Reset stale session
                            </button>
                            <button onClick={handleResetAllSessions} disabled={isConnecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-[14px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
                                <XIcon className="h-4 w-4" />
                                Start fresh
                            </button>
                            <button onClick={handleDisconnect} disabled={isConnecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-[14px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
                                <XIcon className="h-4 w-4" />
                                Disconnect
                            </button>
                        </div>
                    </div>
                ) : connected ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                            {status?.sessions?.filter((s) => s.status === 'connected').map((s) => (
                                <div key={s.label} className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/10">
                                            <CheckCircleIcon className="h-4 w-4 text-[var(--accent)]" />
                                        </div>
                                        <div>
                                            <p className="text-[14px] font-medium text-[var(--text-primary)]">{s.ownerName || s.label}</p>
                                            <p className="text-[12px] text-[var(--text-muted)]">{s.phoneNumber || ''}</p>
                                        </div>
                                    </div>
                                    <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                                        Connected
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex w-full flex-wrap gap-2">
                            <button onClick={handleResetSession} disabled={isConnecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/30 px-4 py-3 text-[14px] font-semibold text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50">
                                {isConnecting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
                                Reset stale session
                            </button>
                            <button onClick={handleResetAllSessions} disabled={isConnecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-[14px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
                                {isConnecting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <XIcon className="h-4 w-4" />}
                                Start fresh
                            </button>
                            <button onClick={handleDisconnect} disabled={isConnecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-[14px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
                                {isConnecting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PowerIcon className="h-4 w-4" />}
                                Disconnect
                            </button>
                        </div>
                    </div>
                ) : activeSession ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                        <p className="text-[14px] font-medium text-amber-300">An active session already exists</p>
                        <p className="mt-1 text-[12px] text-amber-400/70">Disconnect the active session before connecting a new one.</p>
                        <button onClick={handleDisconnect} className="mt-3 rounded-xl border border-red-500/30 px-4 py-2 text-[13px] font-semibold text-red-400 transition hover:bg-red-500/10">
                            Disconnect Existing
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleConnect} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-[var(--text-secondary)]">Your Name</label>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <input
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                                    placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                />
                                <input
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                                    placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-[var(--text-secondary)]">WhatsApp Number</label>
                            <input
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                                placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)}
                            />
                            <p className="mt-1 text-[12px] text-[var(--text-muted)]">Country code + number, digits only</p>
                        </div>

                        <div className="flex gap-2">
                        <button type="button" onClick={() => setMode('qr')} className={cn(
                            'flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition',
                            mode === 'qr' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                            )}>QR Scan</button>
                            <button type="button" onClick={() => setMode('pairing')} className={cn(
                                'flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition',
                                mode === 'pairing' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                            )}>Code-based</button>
                        </div>

                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                            {mode === 'pairing'
                                ? 'Use code-based connect if the broker is on a phone. Open WhatsApp on the phone, go to Linked devices, choose Link with phone number, then enter the code shown here.'
                                : 'Use QR scan if the broker can scan from another device. Open WhatsApp on the phone, go to Linked devices, and scan the code shown here.'}
                        </div>

                        <button type="submit" data-action="connect-whatsapp" disabled={isConnecting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[14px] font-semibold text-black transition hover:opacity-90 disabled:opacity-50">
                            {isConnecting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <QrCodeIcon className="h-4 w-4" />}
                            {isConnecting ? 'Connecting...' : mode === 'qr' ? 'Generate QR Code' : 'Generate Pairing Code'}
                        </button>
                    </form>
                )}

                {artifact && artifact.mode === 'qr' && qrSvg && (
                    <div className="mt-6 text-center">
                        <div className="mx-auto mb-3 w-fit rounded-xl border border-[var(--border)] bg-white p-4">
                            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
                        </div>
                        <p className="text-[13px] text-[var(--text-secondary)]">
                            Scan with WhatsApp <span className="font-medium text-[var(--accent)]">{'> '}Linked Devices{' > '}Link a Device</span>
                        </p>
                        {timeLeft > 0 && (
                            <p className="mt-1 text-[12px] text-[var(--text-muted)]">QR expires in {timeLeft}s</p>
                        )}
                    </div>
                )}

                {artifact && artifact.mode === 'pairing' && artifact.value && (
                    <div className="mt-6 text-center">
                        <div className="mx-auto w-fit rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-8 py-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Pairing Code</p>
                            <p className="mt-1 text-3xl font-bold tracking-[0.15em] text-[var(--accent)]">{artifact.value}</p>
                        </div>
                        <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
                            Open WhatsApp {'> '} Linked Devices {'> '} Link a Device {'> '} Enter Code
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={handleCopyPairingCode}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                            >
                                Copy code
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleRefreshPairingCode()}
                                className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-black transition hover:opacity-90"
                            >
                                Refresh code
                            </button>
                        </div>
                        {copyMessage ? (
                            <p className="mt-2 text-[12px] text-[var(--text-muted)]">{copyMessage}</p>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
};
