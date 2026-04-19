'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const models = [
    { id: 'claude', name: 'Claude 3.5 Sonnet', icon: '✨' },
    { id: 'groq', name: 'Groq Llama 3', icon: '⚡' },
    { id: 'openrouter', name: 'OpenRouter', icon: '🌐' },
];

export const ModelSelector = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState(models[0]);

    return (
        <div className="relative inline-block">
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 glass rounded-lg text-sm font-medium hover:bg-white/10 transition-all"
            >
                <span>{selected.icon} {selected.name}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full mt-2 left-0 w-48 glass rounded-xl overflow-hidden z-50 shadow-2xl"
                    >
                        {models.map((model) => (
                            <button
                                key={model.id}
                                onClick={() => {
                                    setSelected(model);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-white/10 ${selected.id === model.id ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                            >
                                {model.icon} {model.name}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
