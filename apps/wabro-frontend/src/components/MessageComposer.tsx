'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { MessageSquare } from 'lucide-react';

interface MessageComposerProps {
  data: { message: string; speedMode: string };
  setData: (data: Partial<{ message: string }>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function MessageComposer({ data, setData, onNext, onBack }: MessageComposerProps) {
  const [message, setMessage] = useState(data.message);

  const handleNext = () => {
    setData({ message });
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex-1 flex flex-col"
    >
      <div className="bg-wa-card border border-wa-border rounded-2xl p-6 mb-4 flex-1">
        <h2 className="text-lg font-semibold mb-1">Write Message</h2>
        <p className="text-wa-dim text-sm mb-6">This message will be sent to all selected recipients</p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          className="w-full h-40 p-4 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal resize-none text-sm leading-relaxed"
          autoFocus
        />
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs text-wa-dim">
            Tip: Keep messages personal to avoid being flagged
          </div>
          <div className={`text-xs ${message.length > 1000 ? 'text-yellow-400' : 'text-wa-dim'}`}>
            {message.length} characters
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-wa-card border border-wa-border rounded-xl text-wa-dim hover:text-wa-text transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleNext}
          disabled={!message.trim()}
          className="flex items-center gap-2 px-6 py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </motion.div>
  );
}
