import React from 'react';
import { motion } from 'framer-motion';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'connected' | 'disconnected' | 'processing' | 'free' | 'cheap' | 'expensive' | 'fast' | 'medium' | 'slow' | 'local';
}

const variants = {
    connected: 'bg-green-500/10 text-green-400 border-green-500/20',
    disconnected: 'bg-red-500/10 text-red-400 border-red-500/20',
    processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    free: 'bg-green-500/10 text-green-400 border-green-500/20',
    cheap: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    expensive: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    fast: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    slow: 'bg-red-500/10 text-red-400 border-red-500/20',
    local: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export const Badge = ({ children, variant = 'connected' }: BadgeProps) => {
    return (
        <motion.span 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${variants[variant]}`}
        >
            {children}
        </motion.span>
    );
};
