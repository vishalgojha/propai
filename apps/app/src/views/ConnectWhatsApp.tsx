import React, { useCallback, useEffect, useState } from 'react';
import {
    CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, LoaderIcon,
    PowerIcon, QrCodeIcon, RefreshIcon, SmartphoneIcon, XIcon,
} from '../lib/icons';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

type Session = {
    label: string;
    ownerName?: string | null;
    phoneNumber?: string | null;
    status: 'connected' | 'connecting' | 'disconnected';
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
    const [status, setStatus] = useState<StatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState(user?.full_name || user?.email?.split('@')[0] || '');
    const [phone, setPhone] = useState('');
    const [artifact, setArtifact] = useState<ConnectionArtifact | null>(null);
    const [qrSvg, setQrSvg] = useState<string | null>(null);
    const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
    const [mode, setMode] = useState<'qr' | 'pairing'>('qr');

    const QR_FRESHNESS = 90;

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
                    setName(p.fullName || name);
                    setPhone(p.phone || phone);
                }
            } catch { }
            setLoading(false);
        })();
    }, [fetchStatus, name, phone]);

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

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        const normPhone = phone.replace(/\D/g, '');
        if (!name.trim() || normPhone.length < 10 || normPhone.length > 15) {
            setError('Enter your name and WhatsApp number (country code + digits).');
            return;
        }

        setConnecting(true);
        setError(null);
        setArtifact(null);
        setQrSvg(null);
        setQrGeneratedAt(null);

        try {
            await backendApi.post(ENDPOINTS.whatsapp.profile, { fullName: name.trim(), phone: normPhone });
            const resp = await backendApi.post(ENDPOINTS.whatsapp.connect, {
                phoneNumber: normPhone, ownerName: name.trim(), label: `device-${normPhone}`, connectMethod: mode,
            });
            if (resp.data?.connected) {
                setArtifact(null);
            } else {
                const next = resp.data?.artifact || null;
                setArtifact(next);
                setQrGeneratedAt(Date.now());
            }
            await fetchStatus();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        const session = status?.sessions?.find((s) => s.status === 'connected') || status?.sessions?.[0];
        if (!session) return;
        setConnecting(true);
        try {
            await backendApi.post(ENDPOINTS.whatsapp.disconnect, { label: session.label });
            setArtifact(null);
            setQrSvg(null);
            setQrGeneratedAt(null);
            await fetchStatus();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setConnecting(false);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
                <LoaderIcon className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    const connected = status?.sessions?.some((s) => s.status === 'connected');

    return (
        <div className="mx-auto max-w-lg py-10">
            <div className="mb-8 text-center">
                <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Connect WhatsApp</h1>
                <p className="text-[15px] text-[var(--text-secondary)]">Link your device to let Pulse monitor your groups</p>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                    {error}
                </div>
            )}

            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)]">
                        <SmartphoneIcon className="h-5 w-5 text-[var(--accent)]" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Device Status</p>
                        <p className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">
                            {status?.activeCount || 0} / {status?.limit || 2} devices connected
                        </p>
                    </div>
                </div>

                {connected ? (
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
                        <button onClick={handleDisconnect} disabled={connecting} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-[14px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
                            {connecting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PowerIcon className="h-4 w-4" />}
                            Disconnect
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleConnect} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-[var(--text-secondary)]">Your Name</label>
                            <input
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                                placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-[var(--text-secondary)]">WhatsApp Number</label>
                            <input
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                                placeholder="919876543210" value={phone} onChange={(e) => setPhone(e.target.value)}
                            />
                            <p className="mt-1 text-[12px] text-[var(--text-muted)]">Country code + number, digits only</p>
                        </div>

                        <div className="flex gap-2">
                            <button type="button" onClick={() => setMode('qr')} className={cn(
                                'flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition',
                                mode === 'qr' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                            )}>QR Code</button>
                            <button type="button" onClick={() => setMode('pairing')} className={cn(
                                'flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition',
                                mode === 'pairing' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                            )}>Pairing Code</button>
                        </div>

                        <button type="submit" disabled={connecting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[14px] font-semibold text-black transition hover:opacity-90 disabled:opacity-50">
                            {connecting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <QrCodeIcon className="h-4 w-4" />}
                            {connecting ? 'Connecting...' : mode === 'qr' ? 'Generate QR Code' : 'Request Pairing Code'}
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
                    </div>
                )}
            </div>
        </div>
    );
};
