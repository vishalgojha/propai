'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageSquare, Phone, Video, Send, Mic, MicOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { ModelSelector } from '@/components/ui/ModelSelector';
import { AIProcessing } from '@/components/ui/AIProcessing';

interface Message {
    id: string;
    remote_jid: string;
    message_text: string;
    timestamp: string;
}

interface AgentEvent {
    id: string;
    event_type: string;
    description: string;
    created_at: string;
}

export default function Dashboard() {
    const [user, setUser] = useState<any>(null);
    const [status, setStatus] = useState('disconnected');
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [events, setEvents] = useState<AgentEvent[]>([]);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const router = useRouter();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) router.push('/login');
            else {
                setUser(user);
                fetchStatus();
                subscribeToEvents(user.id);
            }
        };
        getUser();
    }, [router]);

    const subscribeToEvents = (userId: string) => {
        const channel = supabase
            .channel('agent-events')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'agent_events', 
                filter: `tenant_id=eq.${userId}` 
            }, (payload) => {
                setEvents(prev => [payload.new as AgentEvent, ...prev].slice(0, 20));
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    };

    useEffect(() => {
        if (user) {
            const interval = setInterval(() => {
                fetchStatus();
                if (selectedChat) fetchMessages();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [user, selectedChat]);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/whatsapp/status?tenantId=${user.id}`);
            const data = await res.json();
            setStatus(data.status);
        } catch (e) {}
    };

    const fetchMessages = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/whatsapp/messages?tenantId=${user.id}`);
            const data = await res.json();
            setMessages(data);
        } catch (e) {}
    };

    const connectWhatsApp = async () => {
        await fetch('http://localhost:3001/api/whatsapp/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId: user.id }),
        });
    };

    const handleSend = async () => {
        if (!inputText || !selectedChat) return;
        const text = inputText;
        setInputText('');
        setMessages(prev => [...prev, { id: Date.now().toString(), remote_jid: selectedChat, message_text: text, timestamp: new Date().toISOString() }]);
        
        try {
            await fetch('http://localhost:3001/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: user.id, remoteJid: selectedChat, text }),
            });
            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
            }, 2000);
        } catch (e) {}
    };

    const startRecording = async () => {
        if (isMuted) return;
        setIsRecording(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
        } catch (e) {
            setIsRecording(false);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        setIsRecording(false);
    };

    const conversations = Array.from(new Set(messages.map(m => m.remote_jid))).map(jid => {
        const chatMsgs = messages.filter(m => m.remote_jid === jid);
        return { jid, lastMsg: chatMsgs[chatMsgs.length - 1] };
    });

    return (
        <div className="h-screen flex bg-black text-white overflow-hidden font-sans">
            <div className="flex h-full w-full">
                <div className="w-64 glass border-r border-white/10 flex flex-col">
                    <div className="p-6 flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tighter">Inbox</h2>
                        <Badge variant={status === 'connected' ? 'connected' : 'disconnected'}>
                            {status}
                        </Badge>
                    </div>
                    <div className="px-4 mb-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input type="text" placeholder="Search chats..." className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 space-y-1">
                        {conversations.map((chat) => (
                            <button key={chat.jid} onClick={() => setSelectedChat(chat.jid)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left ${selectedChat === chat.jid ? 'bg-white text-black' : 'hover:bg-white/5 text-gray-400'}`}>
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                                <div className="flex-1 overflow-hidden">
                                    <span className="font-medium truncate">{chat.jid.split('@')[0]}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="p-4 border-t border-white/10">
                        {status === 'disconnected' && <button onClick={connectWhatsApp} className="btn-primary w-full py-2 text-sm">Connect WhatsApp</button>}
                    </div>
                </div>

                <div className="flex-1 flex flex-col bg-black">
                    {selectedChat ? (
                        <>
                            <div className="h-16 glass border-b border-white/10 flex items-center justify-between px-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                                    <span className="font-medium">{selectedChat.split('@')[0]}</span>
                                </div>
                                <div className="flex items-center gap-4 text-gray-400">
                                    <Phone className="w-5 h-5" /><Video className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {messages.filter(m => m.remote_jid === selectedChat).map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.id.includes('Date.now') ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${msg.id.includes('Date.now') ? 'bg-white text-black' : 'glass'}`}>
                                            {msg.message_text}
                                        </div>
                                    </div>
                                ))}
                                {isTyping && <div className="flex justify-start"><AIProcessing /></div>}
                            </div>
                            <div className="p-6 glass border-t border-white/10">
                                <div className="flex items-center gap-3">
                                    <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 px-6" />
                                    <button onClick={handleSend} className="bg-white text-black p-3 rounded-full"><Send className="w-5 h-5" /></button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                            <MessageSquare className="w-16 h-16 mb-4 opacity-20" /><p>Select a chat to start</p>
                        </div>
                    )}
                </div>

                <div className="w-80 glass border-l border-white/10 flex flex-col p-6">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="font-bold text-lg">AI Agent</h3>
                        <ModelSelector />
                    </div>
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 glass rounded-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center animate-pulse"><MessageSquare className="w-5 h-5 text-white" /></div>
                                <div><p className="text-sm font-bold">Local Voice</p><Badge variant="connected">Active</Badge></div>
                            </div>
                            <div className="flex gap-2">
                                <button onMouseDown={startRecording} onMouseUp={stopRecording} className={`p-3 rounded-full ${isRecording ? 'bg-red-500' : 'bg-white/10'}`}>
                                    {isRecording ? <Mic className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
                                </button>
                                <button onClick={() => setIsMuted(!isMuted)} className={`p-3 rounded-full ${isMuted ? 'bg-red-500/20' : 'bg-white/10'}`}>
                                    <MicOff className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        {isRecording && (
                            <div className="flex justify-center items-center gap-1 h-8">
                                {[...Array(5)].map((_, i) => (
                                    <motion.div key={i} animate={{ height: [8, 24, 8] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }} className="w-1 bg-blue-400 rounded-full" />
                                ))}
                            </div>
                        )}
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <label className="text-xs uppercase text-gray-500 font-bold mb-3">Agent Activity</label>
                            <div className="flex-1 overflow-y-auto space-y-3">
                                <AnimatePresence>
                                    {events.length === 0 && <p className="text-xs text-gray-600 italic">No recent activity</p>}
                                    {events.map((event) => (
                                        <motion.div key={event.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-white/5">
                                            <span className="text-xs font-bold text-blue-400">{event.event_type}</span>
                                            <p className="text-xs text-gray-300">{event.description}</p>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                        <div className="pt-6 border-t border-white/10">
                            <label className="text-xs uppercase text-gray-500 font-bold mb-3">AI Settings</label>
                            <div className="space-y-3">
                                <select className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs">
                                    <option>Listen Only</option><option>Auto-Reply</option><option>Broadcast</option>
                                </select>
                                <select className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs">
                                    <option>Immediate</option><option>30s Delay</option><option>Approval</option>
                                </select>
                                <select className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs">
                                    <option>Professional</option><option>Friendly</option><option>Hinglish</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
