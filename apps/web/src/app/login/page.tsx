'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Lock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function LoginPage() {
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSendOtp = async () => {
        if (!phone) return;
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/api/auth/request-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
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
            const res = await fetch(`${API_URL}/api/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Verification failed');

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
                    <p className="text-gray-400">Enter your WhatsApp number to get started</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    {step === 'PHONE' ? (
                        <div className="relative group">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                            <input 
                                type="tel" 
                                placeholder="+91 98765 43210" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
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
                        onClick={step === 'PHONE' ? handleSendOtp : handleVerifyOtp}
                        disabled={loading}
                        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-lg"
                    >
                        {loading ? 'Processing...' : (step === 'PHONE' ? 'Send via WhatsApp' : 'Verify & Enter')} <ArrowRight className="w-5 h-5" />
                    </button>
                    
                    {step === 'OTP' && (
                        <button 
                            onClick={() => { setStep('PHONE'); setOtp(''); }}
                            className="w-full text-center text-sm text-gray-500 hover:text-white transition-colors"
                        >
                            Change WhatsApp number
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