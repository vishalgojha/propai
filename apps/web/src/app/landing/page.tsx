'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4">
            {/* Background Glow */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 blur-[120px] rounded-full" />

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="z-10 text-center max-w-4xl"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-medium text-gray-400 mb-6">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    Now in Private Beta for Top Brokers
                </div>
                
                <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6 bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
                    PropAI Sync
                </h1>
                
                <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                    The intelligence layer for real estate brokers. Automate WhatsApp leads, 
                    sync client data, and scale your outreach with AI.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="btn-primary flex items-center gap-2 px-8 py-4 text-lg"
                    >
                        Get Started <ArrowRight className="w-5 h-5" />
                    </motion.button>
                    <button className="px-8 py-4 text-lg font-medium text-gray-400 hover:text-white transition-colors">
                        View Demo
                    </button>
                </div>
            </motion.div>

            {/* Mockup / Visual Element */}
            <motion.div 
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.2 }}
                className="mt-20 w-full max-w-5xl glass rounded-2xl p-2 aspect-video relative"
            >
                <div className="w-full h-full rounded-xl bg-black overflow-hidden flex">
                    <div className="w-64 border-r border-white/10 p-4 hidden md:block">
                        <div className="space-y-4">
                            <div className="h-4 w-3/4 bg-white/10 rounded" />
                            <div className="h-4 w-1/2 bg-white/10 rounded" />
                            <div className="h-4 w-2/3 bg-white/10 rounded" />
                        </div>
                    </div>
                    <div className="flex-1 p-8 flex flex-col justify-center items-center">
                         <div className="text-gray-600 italic">Interactive Dashboard Mockup</div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
