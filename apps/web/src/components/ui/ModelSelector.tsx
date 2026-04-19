'use client';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Zap, DollarSign, Maximize } from 'lucide-react';
import { Badge } from './Badge';
import { useModels, ModelInfo } from '@/lib/hooks/useModels';

export const ModelSelector = () => {
    const { models, loading } = useModels();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<ModelInfo | null>(null);

    const filteredModels = useMemo(() => {
        return models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()));
    }, [models, search]);

    const groupedModels = useMemo(() => {
        const groups: Record<string, ModelInfo[]> = {};
        filteredModels.forEach(m => {
            if (!groups[m.provider]) groups[m.provider] = [];
            groups[m.provider].push(m);
        });
        return groups;
    }, [filteredModels]);

    const currentModel = selected || models[0] || null;

    if (loading && !currentModel) return <div className="h-8 w-32 animate-pulse bg-white/10 rounded-lg" />;

    return (
        <div className="relative inline-block">
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 glass rounded-lg text-sm font-medium hover:bg-white/10 transition-all"
            >
                <span>{currentModel?.name || 'Select Model'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full mt-2 left-0 w-80 glass rounded-xl overflow-hidden z-50 shadow-2xl max-h-[500px] flex flex-col"
                    >
                        <div className="p-3 border-b border-white/10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Filter models..." 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-white/20"
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto p-2 space-y-4">
                            {Object.entries(groupedModels).map(([provider, providerModels]) => (
                                <div key={provider} className="space-y-1">
                                    <div className="px-2 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                        {provider}
                                    </div>
                                    {providerModels.map((model) => (
                                        <button
                                            key={model.id}
                                            onClick={() => {
                                                setSelected(model);
                                                setIsOpen(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg transition-all hover:bg-white/10 flex flex-col gap-1 ${selected?.id === model.id ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium">{model.name}</span>
                                                <div className="flex gap-1">
                                                    {model.isLocal && <Badge variant="local">Local</Badge>}
                                                    <Badge variant={model.cost}>{model.cost}</Badge>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] opacity-60">
                                                <span className="flex items-center gap-1">
                                                    <Zap className="w-2 h-2" /> {model.speed}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Maximize className="w-2 h-2" /> {model.contextWindow.toLocaleString()}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
