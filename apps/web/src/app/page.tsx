'use client';
import { useEffect, Suspense, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

const PROP_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_PROP_WHATSAPP_NUMBER || '1234567890';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.propai.live';
const QR_POLL_INTERVAL = 5000;

const features = [
    {
        icon: (
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
        ),
        title: 'AI Conversations',
        desc: 'Chat with leads 24/7. AI answers property questions, books viewings, negotiates — automatically.'
    },
    {
        icon: (
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
        ),
        title: 'Voice AI',
        desc: 'Call leads, qualify them with voice AI, transcribe and summarize — hands-free.'
    },
    {
        icon: (
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
        title: 'Lead Management',
        desc: "Auto-capture, score, and route leads. Know exactly who's ready to buy."
    },
    {
        icon: (
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
        ),
        title: 'Analytics Dashboard',
        desc: "Track conversations, conversion rates, and revenue. Optimize what's working."
    }
];

function QRCodeSection() {
    const searchParams = useSearchParams();
    const ref = searchParams.get('ref');
    const [qr, setQr] = useState<string | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'scanned' | 'connected'>('loading');
    const [error, setError] = useState<string | null>(null);

    const fetchQR = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/auth/system-qr`);
            const data = await res.json();
            if (data.qr) {
                setQr(data.qr);
                setStatus('ready');
            } else if (data.status === 'waiting') {
                setStatus('loading');
            }
        } catch (e) {
            console.error('Failed to fetch QR:', e);
        }
    }, []);

    useEffect(() => {
        fetchQR();
        const interval = setInterval(fetchQR, QR_POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchQR]);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/auth/system-status`);
                const data = await res.json();
                if (data.connected) {
                    setStatus('connected');
                }
            } catch (e) {
                // ignore
            }
        };
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    if (status === 'connected') {
        return (
            <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-green-500/10">
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">WhatsApp Connected!</h3>
                    <p className="text-gray-500">Your WhatsApp is linked to PropAI. Start chatting with your leads.</p>
                </div>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-green-500/10">
                <div className="flex flex-col items-center justify-center min-h-[320px]">
                    <div className="w-12 h-12 border-4 border-green-200 border-t-green-500 rounded-full animate-spin mb-4" />
                    <p className="text-gray-500">Initializing WhatsApp session...</p>
                    <p className="text-xs text-gray-400 mt-1">Please wait a moment</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-green-500/10">
            <div className="flex justify-center mb-5">
                {qr && (
                    <div className="relative">
                        <QRCodeSVG
                            value={qr}
                            size={260}
                            level="H"
                            bgColor="#ffffff"
                            fgColor="#000000"
                            imageSettings={{
                                src: '/favicon.svg',
                                height: 40,
                                width: 40,
                                excavate: true
                            }}
                        />
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-medium">
                            ⚡ Scan within 60 seconds
                        </div>
                    </div>
                )}
            </div>
            <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-gray-800">
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    <span className="font-bold text-lg">Scan with WhatsApp</span>
                </div>
                <p className="text-sm text-gray-500">
                    Opens WhatsApp to connect your account
                </p>
            </div>
        </div>
    );
}

function FallbackSection() {
    const searchParams = useSearchParams();
    const ref = searchParams.get('ref');
    const baseMessage = "Hi, I'm a real estate broker. Please onboard me to PropAI Live.";
    const message = ref ? `${baseMessage} (Ref: ${ref})` : baseMessage;
    const waUrl = `https://wa.me/${PROP_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    return (
        <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full transition-all shadow-lg shadow-green-500/25 text-lg"
        >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Open WhatsApp on this device
        </a>
    );
}

function ReferralSection() {
    const searchParams = useSearchParams();
    const ref = searchParams.get('ref');
    const [baseUrl, setBaseUrl] = useState('app.propai.live');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setBaseUrl(window.location.origin);
        }
    }, []);

    const fullUrl = `${baseUrl}?ref=${ref || 'YOUR_NAME'}`;

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5">
            <p className="text-sm text-gray-300 mb-3 font-medium">Share your referral link</p>
            <code className="text-xs text-green-400 bg-gray-900/50 px-3 py-2 rounded-lg block break-all">
                {fullUrl}
            </code>
            <p className="text-xs text-gray-500 mt-2">Track which brokers onboard via your link</p>
        </div>
    );
}

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white">
            <div className="max-w-5xl mx-auto px-4 py-12">
                <div className="text-center mb-10">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/25">
                            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                        PropAI
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-300 mb-2">
                        Your AI-Powered Broker Copilot
                    </p>
                    <p className="text-gray-500 max-w-xl mx-auto">
                        Close more deals with AI that handles your WhatsApp leads, voice calls, and CRM — while you focus on showing properties.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                    {features.map((f, i) => (
                        <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 hover:border-gray-600/50 transition-all hover:-translate-y-0.5">
                            <div className="mb-3">{f.icon}</div>
                            <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
                    <div className="flex-1 w-full">
                        <Suspense fallback={
                            <div className="bg-white rounded-3xl p-8 shadow-2xl">
                                <div className="w-[260px] h-[260px] bg-gray-100 animate-pulse rounded-xl mx-auto" />
                            </div>
                        }>
                            <QRCodeSection />
                        </Suspense>
                    </div>

                    <div className="flex-1 w-full space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold mb-4 text-white">How it works</h2>
                            <ol className="space-y-4">
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">1</span>
                                    <div>
                                        <p className="font-medium text-white">Scan the QR code</p>
                                        <p className="text-sm text-gray-400">Opens WhatsApp to connect your account instantly</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">2</span>
                                    <div>
                                        <p className="font-medium text-white">Verify your number</p>
                                        <p className="text-sm text-gray-400">Your phone number is detected automatically when you send a message.</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">3</span>
                                    <div>
                                        <p className="font-medium text-white">Start chatting</p>
                                        <p className="text-sm text-gray-400">Ask property questions, get listings, book viewings — all via WhatsApp.</p>
                                    </div>
                                </li>
                            </ol>
                        </div>

                        <Suspense fallback={<div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 h-24" />}>
                            <ReferralSection />
                        </Suspense>

                        <FallbackSection />
                    </div>
                </div>

                <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        AI Available 24/7
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        WhatsApp Native
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                        Voice + Chat AI
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                        Lead Intelligence
                    </span>
                </div>

                <p className="mt-8 text-center text-xs text-gray-600">
                    By connecting via WhatsApp, you agree to our Terms of Service. Your data is used solely to provide PropAI services.
                </p>
            </div>
        </div>
    );
}
