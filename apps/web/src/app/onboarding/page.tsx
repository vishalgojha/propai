'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, User, MessageCircle, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

type Step = 'GREET' | 'PHONE' | 'QR' | 'GROUPS' | 'CONFIRM';

export default function Onboarding() {
    const [step, setStep] = useState<Step>('GREET');
    const [user, setUser] = useState<any>(null);
    const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string, type?: 'qr' | 'groups' | 'pill', data?: any}[]>([]);
    const [input, setInput] = useState('');
    const [phone, setPhone] = useState('');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [availableGroups, setAvailableGroups] = useState<{id: string, name: string}[]>([]);
    const router = useRouter();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) router.push('/login');
            else {
                setUser(user);
                addMessage('ai', `Hi ${user.full_name || 'there'}! I'm your PropAI Agent. Let's get your WhatsApp connected so I can start syncing your leads. 🚀`);
            }
        };
        getUser();
    }, [router]);

    const addMessage = (role: 'ai' | 'user', text: string, type?: 'qr' | 'groups' | 'pill', data?: any) => {
        setMessages(prev => [...prev, { role, text, type, data }]);
    };

    const handleSend = async () => {
        if (!input) return;
        const userText = input;
        setInput('');
        addMessage('user', userText);

        if (step === 'GREET') {
            setStep('PHONE');
            setTimeout(() => addMessage('ai', "Great! First, what's your WhatsApp phone number (with country code)?"), 800);
        } else if (step === 'PHONE') {
            setPhone(userText);
            setStep('QR');
            setTimeout(async () => {
                addMessage('ai', "Perfect. I'm generating your unique connection code now. Scan this with your WhatsApp 'Linked Devices' menu.");
                addMessage('ai', "Scan me!", 'qr', { tenantId: user.id });
                
                // Poll for connection
                const poll = setInterval(async () => {
                    const res = await fetch(`http://localhost:3001/api/whatsapp/status?tenantId=${user.id}`);
                    const data = await res.json();
                    if (data.status === 'connected') {
                        clearInterval(poll);
                        setStep('GROUPS');
                        addMessage('ai', "Connected! ✅ I can see your WhatsApp. I've found several groups and contacts.");
                        
                        // Fetch groups
                        const groupRes = await fetch(`http://localhost:3001/api/whatsapp/groups?tenantId=${user.id}`);
                        const groupData = await groupRes.json();
                        setAvailableGroups(groupData);
                        addMessage('ai', "Which of these groups should I monitor for property listings?", 'groups', groupData);
                    }
                }, 3000);
            }, 800);
        }
    };

    const toggleGroup = (id: string) => {
        setSelectedGroups(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const confirmOnboarding = async () => {
        // Save group configs to Supabase
        for (const id of selectedGroups) {
            await fetch('http://localhost:3001/api/whatsapp/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group_id: id, tenant_id: user.id, behavior: 'Listen' }),
            });
        }
        addMessage('ai', "All set! Your agent is now live and monitoring. Welcome to the Inbox.");
        setTimeout(() => router.push('/dashboard'), 2000);
    };

    return (
        <div className="h-screen flex items-center justify-center bg-black p-4 font-sans">
            <div className="w-full max-w-2xl h-[80vh] glass rounded-3xl flex flex-col overflow-hidden shadow-2xl border-white/10">
                <div className="p-6 border-b border-white/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                        <MessageCircle className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="font-bold">PropAI Agent</h2>
                        <span className="text-xs text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Online
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <AnimatePresence>
                        {messages.map((m, i) => (
                            <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                key={i} 
                                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-white text-black rounded-tr-none' : 'glass text-white rounded-tl-none'}`}>
                                    {m.text}
                                    {m.type === 'qr' && (
                                        <div className="mt-4 p-4 bg-white rounded-2xl inline-block">
                                            <QRCodeSVG value={`http://localhost:3001/api/whatsapp/qr?tenantId=${user.id}`} size={180} />
                                        </div>
                                    )}
                                    {m.type === 'groups' && (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {m.data?.map((g: any) => (
                                                <button 
                                                    key={g.id}
                                                    onClick={() => toggleGroup(g.id)}
                                                    className={`px-3 py-1.5 rounded-full text-xs transition-all border ${selectedGroups.includes(g.id) ? 'bg-blue-500 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                                                >
                                                    {g.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                <div className="p-6 border-t border-white/10 flex gap-3">
                    {step === 'GROUPS' && (
                        <button 
                            onClick={confirmOnboarding}
                            className="btn-primary flex-1 py-3 font-bold"
                        >
                            Complete Setup
                        </button>
                    )}
                    {step !== 'GROUPS' && (
                        <>
                            <input 
                                type="text" 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Type your response..." 
                                className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 px-6 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                            />
                            <button onClick={handleSend} className="bg-white text-black p-3 rounded-full hover:bg-gray-200 transition-all">
                                <Send className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
