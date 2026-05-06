'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the Wabro password');
      return;
    }
    onLogin(password.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col justify-center"
    >
      <div className="bg-wa-card border border-wa-border rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-wa-green rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome to Wabro</h2>
          <p className="text-wa-dim text-sm">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter Wabro password"
              className="w-full px-4 py-3 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-sm mt-2">{error}</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Login
          </button>
        </form>
      </div>
    </motion.div>
  );
}
