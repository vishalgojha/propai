import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Filter, 
  MessageCircle, 
  ShieldCheck, 
  Clock, 
  ArrowRight,
  ChevronDown,
  Layers
} from 'lucide-react';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';

interface Message {
  id: string;
  sender: string;
  group: string;
  content: string;
  type: 'listing' | 'requirement' | 'noise';
  confidence: number;
  time: string;
  date: string;
}

export const Messages: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: 'm1', 
      sender: '+91 98XXX XXX00', 
      group: 'Premium Properties Mumbai', 
      content: 'Westhawk Bandra West. 3BHK for Rent. 1.25 Lakhs per month. 6 months deposit. Immediate. Broker entry allowed.',
      type: 'listing',
      confidence: 96,
      time: '12:45 PM',
      date: 'Today'
    },
    { 
      id: 'm2', 
      sender: '+91 88XXX XXX11', 
      group: 'Powai Broker Network', 
      content: 'Requirement: 2BHK Furnished in Hiranandani Gardens. Budget 70k. Client is bank employee. Please DM.',
      type: 'requirement',
      confidence: 89,
      time: '12:40 PM',
      date: 'Today'
    },
    { 
      id: 'm3', 
      sender: '+91 91XXX XXX22', 
      group: 'Western Suburbs Elite', 
      content: 'Good morning friends. Have a great day ahead! Keep the deals flowing.',
      type: 'noise',
      confidence: 100,
      time: '09:00 AM',
      date: 'Today'
    },
    { 
      id: 'm4', 
      sender: '+91 99XXX XXX33', 
      group: 'Luxury South Mumbai', 
      content: 'SALE: 4BHK Duplex in Cuffe Parade. Jolly Maker. 18Cr negotiable. Clear title. Call for site visit.',
      type: 'listing',
      confidence: 92,
      time: 'Yesterday',
      date: 'Apr 22'
    },
  ]);

  const [filter, setFilter] = useState<'all' | 'listing' | 'requirement'>('all');
  const [search, setSearch] = useState('');

  const filteredMessages = messages.filter(m => {
    const matchesFilter = filter === 'all' || m.type === filter;
    const matchesSearch = m.content.toLowerCase().includes(search.toLowerCase()) || 
                          m.group.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100vh-160px)]">
      {/* Stream Controls */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex bg-neutral-900/50 p-1 rounded-xl border border-neutral-900 w-full md:w-auto">
          {['all', 'listing', 'requirement'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={cn(
                "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all w-1/3 md:w-auto",
                filter === f ? "bg-primary text-black" : "text-neutral-500 hover:text-white"
              )}
            >
              {f === 'all' ? 'Universal' : f}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Intercept keywords..."
            className="w-full bg-neutral-900/50 border border-neutral-900 rounded-xl py-2.5 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Message List */}
      <div className="pulse-scrollbar flex-1 space-y-4 overflow-y-auto pr-0 sm:pr-4">
        <AnimatePresence initial={false}>
          {filteredMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "glass-panel rounded-2xl relative overflow-hidden group border-neutral-900 transition-all",
                msg.type === 'noise' ? "opacity-40 grayscale hover:grayscale-0 hover:opacity-80" : ""
              )}
            >
              {/* Type Accent Rail */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1.5",
                msg.type === 'listing' ? "bg-green-500" : 
                msg.type === 'requirement' ? "bg-primary" : 
                "bg-neutral-800"
              )} />

              <div className="flex flex-col gap-4 p-4 pl-7 sm:flex-row sm:gap-6 sm:p-5 sm:pl-8">
                <div className="flex-1 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[10px] font-black text-white uppercase tracking-widest bg-neutral-900 px-3 py-1 rounded border border-neutral-800">
                        {msg.group}
                      </span>
                      <span className="text-[10px] font-bold text-neutral-600 italic">{msg.sender}</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-500">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{msg.time}</span>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-neutral-300 leading-relaxed font-sans selection:bg-primary selection:text-black">
                    {msg.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <div className={cn(
                      "flex items-center gap-1.5 px-3 py-1 bg-neutral-950 border border-neutral-900 rounded-full text-[10px] font-black uppercase tracking-widest",
                      msg.type === 'listing' ? "text-green-500" : 
                      msg.type === 'requirement' ? "text-primary" : 
                      "text-neutral-500"
                    )}>
                      {msg.type}
                    </div>
                    
                    {msg.type !== 'noise' && (
                    <div className="flex items-center gap-1.5 text-green-500 bg-green-500/5 px-3 py-1 rounded-full border border-green-500/10">
                      <ShieldCheck className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{msg.confidence}% Confidence</span>
                    </div>
                    )}
                  </div>
                </div>

                {msg.type !== 'noise' && (
                  <div className="flex flex-row gap-2 sm:flex-col sm:justify-center">
                    <button className="p-3 bg-neutral-900 hover:bg-primary hover:text-black rounded-xl transition-all group/btn">
                      <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                    <button className="p-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-xl transition-all">
                      <Layers className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Real-time ticker footer */}
      <div className="mt-6 flex flex-col gap-3 border-t border-neutral-900 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
          <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Awaiting Nexus Updates</p>
        </div>
        <p className="text-[10px] font-black text-neutral-700 uppercase tracking-widest">Protocol Version v4.12.0 :: Mumbai Cluster</p>
      </div>
    </div>
  );
};
