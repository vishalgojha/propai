'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, 
    Send, 
    MoreVertical, 
    Phone, 
    Video, 
    ArrowLeft,
    MessageSquare,
    Paperclip,
    X
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { AIProcessing } from '@/components/ui/AIProcessing';
import { Badge } from '@/components/ui/Badge';
import { apiFetch } from '@/lib/api';

interface Message {
    id: string;
    remote_jid: string;
    message_text?: string;
    text?: string;
    timestamp: string;
    sender?: string;
    attachments?: AttachmentPreview[];
}

interface AttachmentPreview {
    data: string;
    mimeType: string;
    fileName: string;
}

export default function MessagesView() {
    const [user, setUser] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const getUser = async () => {
            const supabase = getSupabaseClient();
            if (!supabase) {
                router.push('/login');
                return;
            }

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

    const normalizeMessageText = (message: Message) => message.message_text || message.text || '';

    const fetchMessages = async () => {
        try {
            const res = await apiFetch(`/api/whatsapp/messages?tenantId=${user.id}`);
            const data = await res.json();
            setMessages(data);
            setSelectedChat((current) => current || data?.[0]?.remote_jid || null);
        } catch (e) {
            console.error('Failed to fetch messages', e);
        }
    };

    const fileToAttachment = (file: File) =>
        new Promise<AttachmentPreview>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                data: String(reader.result || ''),
                mimeType: file.type || 'application/octet-stream',
                fileName: file.name,
            });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });

    const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;

        const nextAttachments = await Promise.all(files.map(fileToAttachment));
        setAttachments(prev => [...prev, ...nextAttachments]);
    };

    const handleSend = async () => {
        if ((!inputText.trim() && attachments.length === 0) || !selectedChat) return;

        const text = inputText.trim();
        const filesToSend = attachments;
        setInputText('');
        setAttachments([]);
        
        // Optimistically add the outbound message, then reconcile from the server.
        setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            remote_jid: selectedChat, 
            message_text: text, 
            timestamp: new Date().toISOString(),
            sender: 'Broker',
            attachments: filesToSend
        }]);

        try {
            await apiFetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    remoteJid: selectedChat, 
                    text,
                    attachments: filesToSend
                }),
            });
            setIsTyping(true);
            window.setTimeout(() => {
                setIsTyping(false);
            }, 1200);
            await fetchMessages();

        } catch (e) {
            alert('Failed to send message');
            setAttachments(filesToSend);
            await fetchMessages();
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
                                    {chat.lastMsg ? normalizeMessageText(chat.lastMsg) : ''}
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
                                    className={`flex ${msg.sender === 'Broker' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${msg.sender === 'Broker' ? 'bg-white text-black rounded-tr-none' : 'glass text-white rounded-tl-none'}`}>
                                        {normalizeMessageText(msg)}
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="mt-2 space-y-2">
                                                {msg.attachments.map((file) => (
                                                    <div key={`${msg.id}-${file.fileName}`} className={`text-xs truncate ${msg.sender === 'Broker' ? 'text-black/60' : 'text-white/60'}`}>
                                                        {file.fileName}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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
                            {attachments.length > 0 && (
                                <div className="max-w-4xl mx-auto mb-3 flex flex-wrap gap-2">
                                    {attachments.map((file, index) => (
                                        <div key={`${file.fileName}-${index}`} className="flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-2 text-xs">
                                            <span className="max-w-40 truncate">{file.fileName}</span>
                                            <button
                                                type="button"
                                                onClick={() => setAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                                className="text-gray-400 hover:text-white"
                                                aria-label={`Remove ${file.fileName}`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-3 max-w-4xl mx-auto">
                                <label className="bg-white/5 border border-white/10 text-white p-3 rounded-full hover:bg-white/10 transition-all cursor-pointer">
                                    <Paperclip className="w-5 h-5" />
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={handleFilesSelected}
                                    />
                                </label>
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
