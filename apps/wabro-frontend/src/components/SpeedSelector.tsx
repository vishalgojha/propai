'use client';

import { motion } from 'motion/react';
import { Zap, Shield, Turtle } from 'lucide-react';

interface SpeedSelectorProps {
  data: { speedMode: 'fast' | 'safe' | 'ultra' };
  setData: (data: Partial<{ speedMode: 'fast' | 'safe' | 'ultra' }>) => void;
  onNext: () => void;
  onBack: () => void;
}

const speeds = [
  {
    mode: 'fast' as const,
    icon: <Zap size={20} />,
    title: 'Fast',
    description: '4-8s between messages. ~1h for 100 msgs.',
    tag: 'Max 300/day',
    tagColor: 'bg-yellow-500/20 text-yellow-400',
  },
  {
    mode: 'safe' as const,
    icon: <Shield size={20} />,
    title: 'Safe',
    description: '10-20s between messages. ~4h for 200 msgs.',
    tag: 'Recommended',
    tagColor: 'bg-wa-teal/20 text-wa-teal',
  },
  {
    mode: 'ultra' as const,
    icon: <Turtle size={20} />,
    title: 'Ultra Safe',
    description: '20-40s between messages + 5min breaks every 50.',
    tag: 'Max 1000/day',
    tagColor: 'bg-wa-primary/20 text-wa-primary',
  },
];

export default function SpeedSelector({ data, setData, onNext, onBack }: SpeedSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex-1 flex flex-col"
    >
      <div className="bg-wa-card border border-wa-border rounded-2xl p-6 mb-4 flex-1">
        <h2 className="text-lg font-semibold mb-1">Sending Speed</h2>
        <p className="text-wa-dim text-sm mb-6">Slower = safer. Avoid WhatsApp bans.</p>

        <div className="space-y-3">
          {speeds.map((speed) => (
            <label
              key={speed.mode}
              className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer border transition-all ${
                data.speedMode === speed.mode
                  ? 'border-wa-teal bg-wa-teal/10'
                  : 'border-wa-border bg-wa-bg hover:border-wa-border/80'
              }`}
            >
              <input
                type="radio"
                name="speed"
                checked={data.speedMode === speed.mode}
                onChange={() => setData({ speedMode: speed.mode })}
                className="w-5 h-5 accent-wa-teal"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {speed.icon}
                  <span className="font-semibold text-sm">{speed.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${speed.tagColor}`}>
                    {speed.tag}
                  </span>
                </div>
                <p className="text-xs text-wa-dim">{speed.description}</p>
              </div>
            </label>
          ))}
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
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Start Broadcast →
        </button>
      </div>
    </motion.div>
  );
}
