'use client';
import Link from 'next/link';

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4 text-center">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                PropAI Sync
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl">
                AI-powered WhatsApp automation for real estate brokers. 
                Capture leads, automate responses, and close deals — all from one dashboard.
            </p>
            <div className="flex gap-4">
                <Link 
                    href="/login" 
                    className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-gray-200 transition-all"
                >
                    Get Started Free
                </Link>
                <Link 
                    href="/about" 
                    className="px-8 py-3 bg-transparent border border-gray-700 text-white font-semibold rounded-full hover:bg-gray-900 transition-all"
                >
                    See Features
                </Link>
            </div>
            <div className="mt-16 flex items-center justify-center gap-8 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    WhatsApp Automation
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Voice AI
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    Lead Management
                </div>
            </div>
        </div>
    );
}