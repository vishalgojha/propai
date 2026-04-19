'use client';
import React, { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion } from 'framer-motion';
import { 
    LayoutDashboard, 
    MessageSquare, 
    Settings, 
    Activity, 
    Bell, 
    Search,
    LogOut,
    Plus,
    ArrowLeft,
    Phone,
    Video,
    MoreVertical,
    Send
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/Badge';
import { ModelSelector } from '@/components/ui/ModelSelector';
import { AIProcessing } from '@/components/ui/AIProcessing';

interface Message {
    id: string;
    remote_jid: string;
    message_text: string;
    timestamp: string;
}

export default function Inbox() {
    const [user, setUser] = useState<any>(null);
    const [status, setStatus] = useState('disconnected');
    const [qr, setQR] = useState<string | null>(null);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) router.push('/login');
            else setUser(user);
        };
        getUser();
    }, [router]);

    useEffect(() => {
        if (user) {
            fetchStatus();
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
                setMessages(prev => [...prev, { id: (Date.now()+1).toString(), remote_jid: selectedChat, message_text: "AI: I've noted this request. I'll handle the follow-up.", timestamp: new Date().toISOString() }]);
            }, 2000);
        } catch (e) {
            alert('Failed to send');
        }
    };

    const conversations = Array.from(new Set(messages.map(m => m.remote_jid))).map(jid => {
        const chatMsgs = messages.filter(m => m.remote_jid === jid);
        return { jid, lastMsg: chatMsgs[chatMsgs.length - 1] };
    });

    return (
        <div className="h-screen flex bg-black text-white overflow-hidden font-sans">
            <PanelGroup direction="horizontal">
                {/* Conversations Panel */}
                <Panel defaultSize={25} minSize={20}>
                    <div className="h-full glass border-r border-white/10 flex flex-col">
                        <div className="p-6 flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tighter">Inbox</h2>
                            <Badge variant={status === 'connected' ? 'connected' : 'disconnected'}>
                                {status}
                            </Badge>
                        </div>
                        
                        <div className="px-4 mb-6">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" 
                                    placeholder="Search chats..." 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 space-y-1">
                            {conversations.map((chat) => (
                                <button
                                    key={chat.jid}
                                    onClick={() => setSelectedChat(chat.jid)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left ${selectedChat === chat.jid ? 'bg-white text-black' : 'hover:bg-white/5 text-gray-400'}`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
                                    <div className="flex-1 overflow-hidden">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium truncate">{chat.jid.split('@')[0]}</span>
                                        </div>
                                        <p className={`text-xs truncate ${selectedChat === chat.jid ? 'text-black/60' : 'text-gray-500'}`}>
                                            {chat.lastMsg?.message_text}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="p-4 border-t border-white/10">
                            {status === 'disconnected' && (
                                <button 
                                    onClick={connectWhatsApp}
                                    className="btn-primary w-full py-2 text-sm"
                                >
                                    Connect WhatsApp
                                </button>
                            )}
                        </div>
                    </div>
                </Panel>

                <PanelResizeHandle className="w-1 bg-white/5 hover:bg-white/20 transition-colors cursor-col-resize" />

                {/* Chat Panel */}
                <Panel defaultSize={50} minSize={30}>
                    <div className="h-full flex flex-col bg-black">
                        {selectedChat ? (
                            <>
                                <div className="h-16 glass border-b border-white/10 flex items-center justify-between px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                                        <span className="font-medium">{selectedChat.split('@')[0]}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-400">
                                        <Phone className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                                        <Video className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    {messages.filter(m => m.remote_jid === selectedChat).map((msg) => (
                                        <div key={msg.id} className={`flex ${msg.id.includes('Date.now') ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${msg.id.includes('Date.now') ? 'bg-white text-black rounded-tr-none' : 'glass text-white rounded-tl-none'}`}>
                                                {msg.message_text}
                                            </div>
                                        </div>
                                    ))}
                                    {isTyping && <div className="flex justify-start"><AIProcessing /></div>}
                                </div>

                                <div className="p-6 glass border-t border-white/10">
                                    <div className="flex items-center gap-3 max-w-4xl mx-auto">
                                        <input 
                                            type="text" 
                                            value={inputText}
                                            onChange={(e) => setInputText(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder="Type a message..." 
                                            className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 px-6 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                />
                                        <button onClick={handleSend} className="bg-white text-black p-3 rounded-full hover:bg-gray-200 transition-all">
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                                <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                                <p>Select a chat to start syncing</p>
                            </div>
                        )}
                    </div>
                </Panel>

                <PanelResizeHandle className="w-1 bg-white/5 hover:bg-white/20 transition-colors cursor-col-resize" />

                {/* AI Agent Sidebar */}
                <Panel defaultSize={25} minSize={20}>
                    <div className="h-full glass border-l border-white/10 flex flex-col p-6">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="font-bold text-lg">AI Agent</h3>
                            <ModelSelector />
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3 block">Contextual Tools</label>
                                <div className="flex flex-wrap gap-2">
                                    <button className="px-3 py-1.5 rounded-full glass text-xs hover:bg-white/10 transition-all border-blue-500/30 text-blue-400">👁 Monitor Group</button>
                                    <button className="px-3 py-1.5 rounded-full glass text-xs hover:bg-white/10 transition-all">📢 Broadcast</button>
                                    <button className="px-3 py-1.5 rounded-full glass text-xs hover:bg-white/10 transition-all">🤖 Auto-Reply</button>
                                    <button className="px-3 py-1.5 rounded-full glass text-xs hover:bg-white/10 transition-all">🏷 Classify</button>
                                    <button className="px-3 py-1.5 rounded-full glass text-xs hover:bg-white/10 transition-all">📋 Extract Listings</button>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/10">
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3 block">Behavior Controls</label>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Mode</span>
                                        <select className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none">
                                            <option>Listen Only</option>
                                            <option>Auto-Reply</option>
                                            <option>Broadcast</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Timing</span>
                                        <select className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none">
                                            <option>Immediate</option>
                                            <option>30s Delay</option>
                                            <option>Approval</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Tone</span>
                                        <select className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none">
                                            <option>Professional</option>
                                            <option>Friendly</option>
                                            <option>Hinglish</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
}
