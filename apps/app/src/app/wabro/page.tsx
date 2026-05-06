'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, LogOut } from 'lucide-react';
import Login from './components/Login';
import Connect from './components/Connect';
import Recipients from './components/Recipients';
import MessageComposer from './components/MessageComposer';
import SpeedSelector from './components/SpeedSelector';
import BroadcastProgress from './components/BroadcastProgress';
import '@/lib/api';

export type Step = 'login' | 'connect' | 'recipients' | 'message' | 'speed' | 'progress';

export default function WabroPage() {
  const [currentStep, setCurrentStep] = useState<Step>('login');
  const [password, setPassword] = useState<string | null>(
    typeof window !== 'undefined' ? sessionStorage.getItem('wa_password') : null
  );
  const [broadcastData, setBroadcastData] = useState({
    numbers: [] as string[],
    message: '',
    speedMode: 'safe' as 'fast' | 'safe' | 'ultra',
    groupIds: [] as string[],
    csvData: undefined as string | undefined,
  });

  useEffect(() => {
    if (password && currentStep === 'login') {
      setCurrentStep('connect');
    }
  }, [password]);

  const handleLogin = (pw: string) => {
    sessionStorage.setItem('wa_password', pw);
    setPassword(pw);
    setCurrentStep('connect');
  };

  const logout = () => {
    sessionStorage.removeItem('wa_password');
    setPassword(null);
    setCurrentStep('login');
  };

  const nextStep = () => {
    if (currentStep === 'connect') setCurrentStep('recipients');
    else if (currentStep === 'recipients') setCurrentStep('message');
    else if (currentStep === 'message') setCurrentStep('speed');
    else if (currentStep === 'speed') setCurrentStep('progress');
  };

  const prevStep = () => {
    if (currentStep === 'recipients') setCurrentStep('connect');
    else if (currentStep === 'message') setCurrentStep('recipients');
    else if (currentStep === 'speed') setCurrentStep('message');
  };

  const resetAll = () => {
    setBroadcastData({
      numbers: [],
      message: '',
      speedMode: 'safe',
      groupIds: [],
      csvData: undefined,
    });
    setCurrentStep('connect');
  };

  return (
    <div className="min-h-screen bg-wa-bg flex flex-col items-center p-4">
      <header className="w-full max-w-[500px] flex justify-between items-center py-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-wa-green rounded-full flex items-center justify-center text-wa-bg">
            <Send size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Wabro</h1>
        </div>

        {password && (
          <button
            onClick={logout}
            className="p-2 text-wa-dim hover:text-white transition-colors"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        )}
      </header>

      <main className="w-full max-w-[500px] flex-1 flex flex-col relative overflow-hidden">
        <AnimatePresence mode="wait">
          {currentStep === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col justify-center"
            >
              <Login onLogin={handleLogin} />
            </motion.div>
          )}

          {currentStep === 'connect' && (
            <motion.div
              key="connect"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col"
            >
              <Connect onNext={nextStep} />
            </motion.div>
          )}

          {currentStep === 'recipients' && (
            <motion.div
              key="recipients"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col"
            >
              <Recipients
                data={broadcastData}
                setData={(d) => setBroadcastData(prev => ({ ...prev, ...d }))}
                onNext={nextStep}
                onBack={prevStep}
              />
            </motion.div>
          )}

          {currentStep === 'message' && (
            <motion.div
              key="message"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col"
            >
              <MessageComposer
                data={broadcastData}
                setData={(d) => setBroadcastData(prev => ({ ...prev, ...d }))}
                onNext={nextStep}
                onBack={prevStep}
              />
            </motion.div>
          )}

          {currentStep === 'speed' && (
            <motion.div
              key="speed"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col"
            >
              <SpeedSelector
                data={broadcastData}
                setData={(d) => setBroadcastData(prev => ({ ...prev, ...d }))}
                onNext={nextStep}
                onBack={prevStep}
              />
            </motion.div>
          )}

          {currentStep === 'progress' && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col"
            >
              <BroadcastProgress
                data={broadcastData}
                onReset={resetAll}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-8 text-center">
        <p className="text-wa-dim text-xs">Built for Wabro © 2026. Secure Bulk Messaging.</p>
      </footer>
    </div>
  );
}
