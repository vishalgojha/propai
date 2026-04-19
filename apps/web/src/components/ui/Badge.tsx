import React from 'react';
import { motion } from 'framer-motion';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'connected' | 'disconnected' | 'processing';
}

const variants = {
    connected: 'bg-green-500/10 text-green-400 border-green-500/20',
    disconnected: 'bg-red-500/10 text-red-400 border-red-500/20',
    processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
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
