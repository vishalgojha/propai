'use client';
import { useEffect, Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

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
    },
    {
        icon: (
            <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16v14H4V5zm0 4h16M8 9v10m8-10v10M7 5V3m10 2V3" />
            </svg>
        ),
        title: 'Browser Agent',
        desc: 'Tell PropAI: “Open this listing, check the broker number, compare the price, and draft my reply.”'
    }
];

function LoginForm() {
    const [step, setStep] = useState<'email' | 'otp' | 'success'>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return;
        }

        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                router.replace('/dashboard');
            }
        });
    }, [router]);

    const requestCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const supabase = getSupabaseClient();
            if (!supabase) {
                throw new Error('Supabase is not configured');
            }

            const { error: signInError } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                },
            });

            if (signInError) {
                throw signInError;
            }

            setStep('otp');
        } catch (err: any) {
            setError(err.message || 'Failed to send code');
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const supabase = getSupabaseClient();
            if (!supabase) {
                throw new Error('Supabase is not configured');
            }

            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token: otp,
                type: 'email',
            });

            if (verifyError) {
                throw verifyError;
            }

            if (!data.session) {
                throw new Error('No session returned after verification');
            }

            const bootstrapRes = await apiFetch('/api/auth/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startTrial: false }),
            });

            if (!bootstrapRes.ok) {
                const bootstrapData = await bootstrapRes.json().catch(() => ({}));
                throw new Error(bootstrapData.error || 'Failed to initialize account');
            }

            setStep('success');
            setTimeout(() => router.push('/onboarding'), 800);
        } catch (err: any) {
            setError(err.message || 'Invalid code');
        } finally {
            setLoading(false);
        }
    };

    if (step === 'success') {
        return (
            <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-green-500/10">
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Welcome to PropAI!</h3>
                    <p className="text-gray-500">Your account is verified. Start chatting with your leads.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-green-500/10">
            {!isSupabaseConfigured && (
                <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                    Missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
                </p>
            )}
            {step === 'email' ? (
                <form onSubmit={requestCode} className="space-y-4">
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-1">Get Started</h3>
                        <p className="text-sm text-gray-500">Enter your email to receive a verification code</p>
                    </div>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-800"
                    />
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading || !isSupabaseConfigured}
                        className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : 'Send Verification Code'}
                    </button>
                </form>
            ) : (
                <form onSubmit={verifyCode} className="space-y-4">
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-1">Enter Code</h3>
                        <p className="text-sm text-gray-500">We sent a 6-digit code to {email}</p>
                    </div>
                    <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        required
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-2xl tracking-widest font-mono text-gray-800"
                    />
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading || otp.length !== 6 || !isSupabaseConfigured}
                        className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
                    >
                        {loading ? 'Verifying...' : 'Verify'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep('email')}
                        className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
                    >
                        Change email
                    </button>
                </form>
            )}
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
                        Close more deals with AI that handles your WhatsApp leads, voice calls, browser research, and CRM — while you focus on showing properties.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
                    {features.map((f, i) => (
                        <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 hover:border-gray-600/50 transition-all hover:-translate-y-0.5">
                            <div className="mb-3">{f.icon}</div>
                            <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="mb-12 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-6">
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-300 mb-3">Browser agent examples</p>
                    <div className="grid gap-3 md:grid-cols-3 text-sm text-cyan-50">
                        <div className="rounded-2xl bg-black/20 border border-white/10 p-4">
                            <p className="font-semibold mb-1">“Open this listing and compare the ask.”</p>
                            <p className="text-cyan-100/80">PropAI can open a portal, read the details, and tell you if the price is worth pushing.</p>
                        </div>
                        <div className="rounded-2xl bg-black/20 border border-white/10 p-4">
                            <p className="font-semibold mb-1">“Check the broker number and possession date.”</p>
                            <p className="text-cyan-100/80">It can read the page, pull the contact info, and summarize the key facts for your follow-up.</p>
                        </div>
                        <div className="rounded-2xl bg-black/20 border border-white/10 p-4">
                            <p className="font-semibold mb-1">“Fill the enquiry form and draft my reply.”</p>
                            <p className="text-cyan-100/80">PropAI can click, type, scroll, and capture screenshots like a real broker assistant.</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
                    <div className="flex-1 w-full">
                        <Suspense fallback={
                            <div className="bg-white rounded-3xl p-8 shadow-2xl">
                                <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />
                            </div>
                        }>
                            <LoginForm />
                        </Suspense>
                    </div>

                    <div className="flex-1 w-full space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold mb-4 text-white">How it works</h2>
                            <ol className="space-y-4">
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">1</span>
                                    <div>
                                        <p className="font-medium text-white">Enter your email</p>
                                        <p className="text-sm text-gray-400">Get a verification code sent to your inbox</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">2</span>
                                    <div>
                                        <p className="font-medium text-white">Verify your code</p>
                                        <p className="text-sm text-gray-400">Enter the 6-digit code to activate your account</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">3</span>
                                    <div>
                                        <p className="font-medium text-white">Start chatting</p>
                                        <p className="text-sm text-gray-400">Connect with leads via WhatsApp and let AI do the rest</p>
                                    </div>
                                </li>
                            </ol>
                        </div>
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
                    By connecting, you agree to our Terms of Service.
                </p>
            </div>
        </div>
    );
}
