'use client';
import Link from 'next/link';

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4 text-center">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                PropAI Sync
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl">
                The next generation of AI-powered synchronization for your business. 
                Seamlessly connect your data and automate your workflow.
            </p>
            <div className="flex gap-4">
                <Link 
                    href="/login" 
                    className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-gray-200 transition-all"
                >
                    Get Started
                </Link>
                <Link 
                    href="/about" 
                    className="px-8 py-3 bg-transparent border border-gray-700 text-white font-semibold rounded-full hover:bg-gray-900 transition-all"
                >
                    Learn More
                </Link>
            </div>
        </div>
    );
}
