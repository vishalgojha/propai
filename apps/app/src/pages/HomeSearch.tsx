import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Building, Users, Loader2, Send, Sparkles } from 'lucide-react';
import { backendApiUrl } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

interface SearchResult {
  id: string;
  title: string;
  location: string;
  price: string;
  details: string;
  match: number;
}

const HomeSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [conversation, setConversation] = useState<{role: 'user' | 'ai', text: string}[]>([]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    const userQuery = query;
    setQuery('');
    setConversation(prev => [...prev, { role: 'user', text: userQuery }]);
    setIsSearching(true);

    try {
      const res = await fetch(backendApiUrl + ENDPOINTS.properties.search(userQuery));
      const data = await res.json();
      
      if (data.properties) {
        setResults(data.properties);
      }
      setConversation(prev => [...prev, { role: 'ai', text: data.response || 'I found some properties matching your requirements. Let me know if you\'d like to refine your search.' }]);
    } catch (e) {
      setConversation(prev => [...prev, { role: 'ai', text: 'I\'m having trouble searching right now. Could you tell me more about what you\'re looking for?' }]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero Search */}
      <div className="relative overflow-hidden px-4 py-18 sm:px-6 sm:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(166,255,0,0.15),transparent_50%)]" />
        
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Sparkles className="mx-auto mb-4 h-10 w-10 text-primary sm:h-12 sm:w-12" />
            <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
              Find Your <span className="text-primary">Dream Home</span>
            </h1>
            <p className="text-base text-neutral-400 sm:text-xl">
              AI-powered property search for Mumbai
            </p>
          </motion.div>

          {/* ChatGPT-style Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <Search className="mt-1 h-6 w-6 text-neutral-500" />
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSearch()}
                placeholder="Describe your ideal home... e.g. 2BHK in Bandra under 1Cr"
                className="min-h-[60px] flex-1 resize-none bg-transparent text-base text-white outline-none placeholder-neutral-500 sm:text-lg"
                rows={2}
              />
              <button
                onClick={handleSearch}
                disabled={!query.trim() || isSearching}
                className="rounded-xl bg-primary p-3 font-bold text-black transition-colors hover:bg-yellow-500 disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </motion.div>

          {/* Quick Searches */}
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {['2BHK Bandra', '1Cr Worli', 'Rental Powai', '3BHK Juhu'].map((tag) => (
              <button
                key={tag}
                onClick={() => { setQuery(tag); }}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-sm font-medium transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results / Conversation */}
      <div className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        {conversation.length > 0 && (
          <div className="space-y-4 mb-8">
            {conversation.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] rounded-2xl p-4 sm:max-w-[80%] ${
                  msg.role === 'user' 
                    ? 'bg-primary text-black' 
                    : 'bg-neutral-900 border border-neutral-800'
                }`}>
                  <p className="text-sm">{msg.text}</p>
                </div>
              </motion.div>
            ))}
            {isSearching && (
              <div className="flex gap-4 justify-start">
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="grid gap-4">
            {results.map((prop) => (
              <motion.div
                key={prop.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl hover:border-primary/50 transition-colors cursor-pointer"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-white">{prop.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-neutral-400">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">{prop.location}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-primary">{prop.price}</p>
                    <p className="text-xs text-neutral-500">{prop.match}% match</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-neutral-400">{prop.details}</p>
                <div className="flex gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1 text-neutral-500">
                    <Building className="w-4 h-4" />
                    <span>2BHK</span>
                  </div>
                  <div className="flex items-center gap-1 text-neutral-500">
                    <Users className="w-4 h-4" />
                    <span>Family</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeSearch;
