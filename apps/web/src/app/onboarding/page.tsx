'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, User, MessageCircle, Globe, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

type Step = 'GREET' | 'METHOD' | 'PHONE' | 'CODE' | 'QR' | 'TEAM' | 'GROUPS' | 'CONFIRM';

export default function Onboarding() {
    const [step, setStep] = useState<Step>('GREET');
    const [user, setUser] = useState<any>(null);
    const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string, type?: 'qr' | 'code' | 'groups' | 'pill', data?: any}[]>([]);
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

    const addMessage = (role: 'ai' | 'user', text: string, type?: 'qr' | 'code' | 'groups' | 'pill', data?: any) => {
        setMessages(prev => [...prev, { role, text, type, data }]);
    };

    const handleSend = async () => {
        if (!input) return;
        const userText = input;
        setInput('');
        addMessage('user', userText);

        if (step === 'GREET') {
            setStep('METHOD');
            setTimeout(() => addMessage('ai', "First, how would you like to connect? I can give you a pairing code for your phone, or a QR code for your computer."), 800);
        } else if (step === 'METHOD') {
            if (userText.toLowerCase().includes('phone') || userText.toLowerCase().includes('code')) {
                setStep('PHONE');
                setTimeout(() => addMessage('ai', "Perfect. What's your WhatsApp phone number (with country code, e.g., +91...) ?"), 800);
            } else {
                setStep('QR');
                setTimeout(() => {
                    addMessage('ai', "No problem. Scan this QR code with your WhatsApp 'Linked Devices' menu.");
                    addMessage('ai', "Scan me!", 'qr', { tenantId: user.id });
                    startConnectionPolling();
                }, 800);
            }
        } else if (step === 'PHONE') {
            setPhone(userText);
            setStep('CODE');
            setTimeout(async () => {
                await fetch('http://localhost:3001/api/whatsapp/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tenantId: user.id, phoneNumber: userText, label: 'Owner' }),
                });
                
                const poll = setInterval(async () => {
                    const res = await fetch(`http://localhost:3001/api/whatsapp/qr?tenantId=${user.id}`);
                    const data = await res.json();
                    if (data.qr && data.qr.length === 8) {
                        clearInterval(poll);
                        addMessage('ai', "Here is your pairing code. Open WhatsApp → Linked Devices → Link with phone number → enter this code:", 'code', { code: data.qr });
                    }
                }, 2000);
            }, 800);
        }
    };

    const startConnectionPolling = () => {
        const poll = setInterval(async () => {
            const res = await fetch(`http://localhost:3001/api/whatsapp/status?tenantId=${user.id}`);
            const data = await res.json();
            if (data.status === 'connected') {
                clearInterval(poll);
                setStep('TEAM');
                setTimeout(async () => {
                    // Mark trial started in DB
                    await supabase.from('profiles').update({ 
                        trial_started_at: new Date().toISOString(),
                        trial_used: true 
                    }).eq('id', user.id);
                    
                    // Set default subscription to Trial
                    await fetch('http://localhost:3001/api/subscriptions/set-trial', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tenantId: user.id })
                    });

                    addMessage('ai', "Connected! ✅ Your account is now active. Aapka 7 din ka free trial aaj se shuru ho gaya.");
                    setTimeout(() => {
                        addMessage('ai', "Do you have team members whose WhatsApp should also be connected? You can add up to 2 more.");
                        addMessage('ai', "Just type 'Yes' or 'No'.", 'pill');
                    }, 1000);
                }, 800);
            }
        }, 3000);
    };


    const handleTeamResponse = async (response: string) => {
        if (response.toLowerCase().includes('yes')) {
            setStep('PHONE');
            setTimeout(() => addMessage('ai', "Got it. Please enter the team member's WhatsApp number (with country code) and their name (e.g., +91... | Rahul),"), 800);
        } else {
            setStep('GROUPS');
            // Fetch groups for the connected session
            const groupRes = await fetch(`http://localhost:3001/api/whatsapp/groups?tenantId=${user.id}`);
            const groupData = await groupRes.json();
            setAvailableGroups(groupData);
            addMessage('ai', "Alright, let's focus on your account. Which of these groups should I monitor for property listings?", 'groups', groupData);
        }
    };

    const toggleGroup = (id: string) => {
        setSelectedGroups(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const confirmOnboarding = async () => {
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
                                    {m.type === 'code' && (
                                        <div className="mt-4 flex flex-col items-center gap-3">
                                            <div className="text-3xl font-mono font-bold tracking-widest bg-white/10 px-6 py-3 rounded-xl border border-white/20">
                                                {m.data?.code}
                                            </div>
                                            <button 
                                                onClick={() => navigator.clipboard.writeText(m.data?.code)}
                                                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                                            >
                                                <Copy className="w-3 h-3" /> Copy Code
                                            </button>
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
