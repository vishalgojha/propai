'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const PROP_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_PROP_WHATSAPP_NUMBER || '1234567890';
const BASE_MESSAGE = "Hi, I'm a real estate broker. Please onboard me to PropAI Live.";

function buildWhatsAppUrl(phone: string, message: string): string {
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${phone}?text=${encoded}`;
}

function buildMessage(ref?: string | null): string {
    if (!ref) return BASE_MESSAGE;
    return `${BASE_MESSAGE} (Ref: ${ref})`;
}

export default function Home() {
    const searchParams = useSearchParams();
    const ref = searchParams.get('ref');
    const message = buildMessage(ref);
    const waUrl = buildWhatsAppUrl(PROP_WHATSAPP_NUMBER, message);
    const qrRef = useRef<HTMLDivElement>(null);
    const [qrReady, setQrReady] = useState(false);

    useEffect(() => {
        if (!qrRef.current || qrRef.current.innerHTML) return;

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
        script.async = true;
        script.onload = () => {
            if (qrRef.current && typeof (window as any).QRCode !== 'undefined') {
                new (window as any).QRCode(qrRef.current, {
                    text: waUrl,
                    width: 280,
                    height: 280,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: (window as any).QRCode.CorrectLevel.H
                });
                setQrReady(true);
            }
        };
        document.body.appendChild(script);

        return () => {
            if (qrRef.current) qrRef.current.innerHTML = '';
        };
    }, [waUrl]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white px-4">
            <div className="max-w-md w-full text-center">
                <div className="mb-2">
                    <svg className="w-12 h-12 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                    PropAI
                </h1>
                <p className="text-lg md:text-xl text-gray-400 mb-2">
                    Your AI-Powered Broker Copilot
                </p>
                <p className="text-sm text-gray-500 mb-8">
                    Automate WhatsApp, capture leads, and close deals — powered by AI.
                </p>

                <div className="bg-white rounded-3xl p-8 mb-6 shadow-2xl shadow-green-500/10">
                    <div ref={qrRef} className="flex justify-center mb-4 min-h-[280px] items-center">
                        {!qrReady && (
                            <div className="w-[280px] h-[280px] bg-gray-100 animate-pulse rounded-xl" />
                        )}
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 text-gray-800">
                            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            <span className="font-semibold text-lg">Scan to start on WhatsApp</span>
                        </div>
                        <p className="text-sm text-gray-500">
                            Instant onboarding — no OTP, no forms
                        </p>
                    </div>
                </div>

                <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full transition-all shadow-lg shadow-green-500/25"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Open WhatsApp on this device
                </a>

                <div className="mt-12 flex items-center justify-center gap-6 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        WhatsApp Connected
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        AI Powered
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                        Real Estate Focus
                    </span>
                </div>

                <p className="mt-8 text-xs text-gray-600">
                    By scanning, you agree to connect your WhatsApp for PropAI services.
                </p>
            </div>
        </div>
    );
}
