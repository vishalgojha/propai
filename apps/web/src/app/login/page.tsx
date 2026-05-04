'use client';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
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

    const handleSendOtp = async () => {
        if (!email) return;
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

            setStep('OTP');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp) return;
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

            router.push('/onboarding');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 font-sans">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md glass p-8 rounded-3xl shadow-2xl border-white/10"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2">Welcome to PropAI</h1>
                    <p className="text-gray-400">Enter your email to receive a secure sign-in code</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {!isSupabaseConfigured && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        Missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
                    </div>
                )}

                <div className="space-y-4">
                    {step === 'EMAIL' ? (
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                            <input 
                                type="email" 
                                placeholder="you@example.com" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                            />
                        </div>
                    ) : (
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Enter 6-digit token" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                            />
                        </div>
                    )}

                    <button 
                        onClick={step === 'EMAIL' ? handleSendOtp : handleVerifyOtp}
                        disabled={loading || !isSupabaseConfigured}
                        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-lg"
                    >
                        {loading ? 'Processing...' : (step === 'EMAIL' ? 'Send Sign-In Code' : 'Verify & Enter')} <ArrowRight className="w-5 h-5" />
                    </button>
                    
                    {step === 'OTP' && (
                        <button 
                            onClick={() => { setStep('EMAIL'); setOtp(''); }}
                            className="w-full text-center text-sm text-gray-500 hover:text-white transition-colors"
                        >
                            Change email
                        </button>
                    )}
                </div>

                <p className="text-center text-xs text-gray-600 mt-6">
                    By continuing, you agree to our Terms of Service and Privacy Policy
                </p>
            </motion.div>
        </div>
    );
}
