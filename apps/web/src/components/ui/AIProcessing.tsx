'use client';
import React from 'react';
import { motion } from 'framer-motion';

export const AIProcessing = () => {
    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-full w-fit">
            <span className="text-xs text-gray-400 font-medium">AI is processing</span>
            <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        animate={{ 
                            opacity: [0.3, 1, 0.3],
                            scale: [0.8, 1.2, 0.8] 
                        }}
                        transition={{ 
                            duration: 1, 
                            repeat: Infinity, 
                            delay: i * 0.2 
                        }}
                        className="w-1 h-1 bg-blue-400 rounded-full"
                    />
                ))}
            </div>
        </div>
    );
};
