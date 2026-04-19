'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, 
    Send, 
    MoreVertical, 
    Phone, 
    Video, 
    ArrowLeft 
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { AIProcessing } from '@/components/ui/AIProcessing';
import { Badge } from '@/components/ui/Badge';

interface Message {
    id: string;
    remote_jid: string;
    message_text: string;
    timestamp: string;
}

export default function MessagesView() {
    const [user, setUser] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
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
            fetchMessages();
            const interval = setInterval(fetchMessages, 5000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const fetchMessages = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/whatsapp/messages?tenantId=${user.id}`);
            const data = await res.json();
            setMessages(data);
        } catch (e) {
            console.error('Failed to fetch messages', e);
        }
    };

    const handleSend = async () => {
        if (!inputText || !selectedChat) return;

        const text = inputText;
        setInputText('');
        
        // Optimistically add message to UI
        setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            remote_jid: selectedChat, 
            message_text: text, 
            timestamp: new Date().toISOString() 
        }]);

        try {
            await fetch('http://localhost:3001/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    tenantId: user.id, 
                    remoteJid: selectedChat, 
                    text 
                }),
            });

            // Simulate AI processing response
            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                setMessages(prev => [...prev, { 
                    id: (Date.now()+1).toString(), 
                    remote_jid: selectedChat, 
                    message_text: "This is an AI-generated response from PropAI Sync. 🤖", 
                    timestamp: new Date().toISOString() 
                }]);
            }, 3000);

        } catch (e) {
            alert('Failed to send message');
        }
    };

    const conversations = Array.from(new Set(messages.map(m => m.remote_jid))).map(jid => {
        const chatMsgs = messages.filter(m => m.remote_jid === jid);
        return {
            jid,
            lastMsg: chatMsgs[chatMsgs.length - 1],
        };
    });

    return (
        <div className="h-screen flex bg-black text-white overflow-hidden font-sans">
            {/* Conversations Sidebar */}
            <div className="w-80 glass border-r border-white/10 flex flex-col">
                <div className="p-6 flex items-center justify-between">
                    <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-lg font-bold tracking-tight">Messages</h2>
                    <div className="w-8" />
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
                        <motion.button
                            key={chat.jid}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => setSelectedChat(chat.jid)}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left ${selectedChat === chat.jid ? 'bg-white text-black' : 'hover:bg-white/5 text-gray-400'}`}
                        >
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
                            <div className="flex-1 overflow-hidden">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-medium truncate">{chat.jid.split('@')[0]}</span>
                                    <span className="text-[10px] opacity-60">Just now</span>
                                </div>
                                <p className={`text-xs truncate ${selectedChat === chat.jid ? 'text-black/60' : 'text-gray-500'}`}>
                                    {chat.lastMsg?.message_text}
                                </p>
                            </div>
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Chat Window */}
            <div className="flex-1 flex flex-col relative">
                {selectedChat ? (
                    <>
                        <div className="h-16 glass border-b border-white/10 flex items-center justify-between px-6">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                                <span className="font-medium">{selectedChat.split('@')[0]}</span>
                                <Badge variant="connected">Active</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-gray-400">
                                <Phone className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                                <Video className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                                <MoreVertical className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {messages.filter(m => m.remote_jid === selectedChat).map((msg) => (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={msg.id} 
                                    className={`flex ${msg.id.includes('Date.now') ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${msg.id.includes('Date.now') ? 'bg-white text-black rounded-tr-none' : 'glass text-white rounded-tl-none'}`}>
                                        {msg.message_text}
                                    </div>
                                </motion.div>
                            ))}
                            {isTyping && (
                                <div className="flex justify-start">
                                    <AIProcessing />
                                </div>
                            )}
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
                                <motion.button 
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={handleSend}
                                    className="bg-white text-black p-3 rounded-full hover:bg-gray-200 transition-all"
                                >
                                    <Send className="w-5 h-5" />
                                </motion.button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                        <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                        <p>Select a conversation to start syncing</p>
                    </div>
                )}
            </div>
        </div>
    );
}
