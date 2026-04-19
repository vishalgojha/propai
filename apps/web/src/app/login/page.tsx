'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Phone, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSendOtp = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) {
            alert(error.message);
        } else {
            setStep('OTP');
        }
        setLoading(false);
    };

    const handleVerifyOtp = async () => {
        setLoading(true);
        const { data, error } = await supabase.auth.verifyOtp({ 
            phone, 
            token: otp, 
            type: 'sms' 
        });
        
        if (error) {
            alert(error.message);
        } else if (data.session) {
            router.push('/onboarding');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 font-sans">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md glass p-8 rounded-3xl shadow-2xl border-white/10"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
                    <p className="text-gray-400">Enter your phone to access PropAI Sync</p>
                </div>

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
                            />
                        </div>
                    ) : (
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Enter 6-digit OTP" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                            />
                        </div>
                    )}

                    <button 
                        onClick={step === 'PHONE' ? handleSendOtp : handleVerifyOtp}
                        disabled={loading}
                        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-lg"
                    >
                        {loading ? 'Processing...' : (step === 'PHONE' ? 'Send OTP' : 'Verify & Enter')} <ArrowRight className="w-5 h-5" />
                    </button>
                    
                    {step === 'OTP' && (
                        <button 
                            onClick={() => setStep('PHONE')} 
                            className="w-full text-center text-sm text-gray-500 hover:text-white transition-colors"
                        >
                            Change phone number
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
