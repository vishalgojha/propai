'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { QrCode, Phone, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { connectWhatsApp, getStatus, type StatusData } from '@/lib/api';

interface ConnectProps {
  onNext: () => void;
}

export default function Connect({ onNext }: ConnectProps) {
  const [method, setMethod] = useState<'qr' | 'phone'>('phone');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairCode, setPairCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const data = await getStatus();
      setStatus(data);
      setLoading(false);
      if (data.connected) {
        setError('');
      }
    } catch {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setError('');
    setPairCode('');
    setQrCode('');

    try {
      if (method === 'phone') {
        if (!phone || phone.length < 10) {
          setError('Enter a valid phone number with country code');
          return;
        }
        const res = await connectWhatsApp(phone.replace(/\D/g, ''));
        if (res.code) {
          setPairCode(res.code);
        } else if (res.qr) {
          setQrCode(res.qr);
        } else if (res.error) {
          setError(res.error);
        }
      } else {
        const res = await connectWhatsApp();
        if (res.qr) {
          setQrCode(res.qr);
        } else if (res.error) {
          setError(res.error);
        }
      }
    } catch {
      setError('Connection failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-wa-dim" />
      </div>
    );
  }

  if (status?.connected) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex-1 flex flex-col justify-center"
      >
        <div className="bg-wa-card border border-wa-border rounded-2xl p-8 text-center">
          <CheckCircle2 size={48} className="text-wa-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Connected!</h2>
          <p className="text-wa-dim mb-6">
            {status.contacts} contacts, {status.groups} groups loaded
          </p>
          <button
            onClick={onNext}
            className="w-full py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            Continue <span>→</span>
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 flex flex-col"
    >
      <div className="bg-wa-card border border-wa-border rounded-2xl p-6 mb-4">
        <h2 className="text-lg font-semibold mb-1">Connect WhatsApp</h2>
        <p className="text-wa-dim text-sm mb-6">Link your WhatsApp account to start broadcasting</p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMethod('phone'); setPairCode(''); setQrCode(''); setError(''); }}
            className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${
              method === 'phone'
                ? 'bg-wa-teal text-white'
                : 'bg-wa-bg text-wa-dim border border-wa-border'
            }`}
          >
            <Phone size={16} className="inline mr-2" />
            Phone Number
          </button>
          <button
            onClick={() => { setMethod('qr'); setPairCode(''); setQrCode(''); setError(''); }}
            className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${
              method === 'qr'
                ? 'bg-wa-teal text-white'
                : 'bg-wa-bg text-wa-dim border border-wa-border'
            }`}
          >
            <QrCode size={16} className="inline mr-2" />
            QR Code
          </button>
        </div>

        {method === 'phone' ? (
          <div className="space-y-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="919876543210"
              className="w-full px-4 py-3 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal transition-colors text-center tracking-widest"
            />
            <button
              onClick={handleConnect}
              className="w-full py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Get Pairing Code
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleConnect}
              className="w-full py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Show QR Code
            </button>
          </div>
        )}

        {pairCode && (
          <div className="mt-6 text-center">
            <p className="text-wa-dim text-sm mb-2">Enter this code in WhatsApp:</p>
            <div className="text-3xl font-bold tracking-[0.3em] text-wa-primary bg-wa-bg rounded-xl py-4 border-2 border-dashed border-wa-teal">
              {pairCode}
            </div>
            <ol className="text-left text-sm text-wa-dim mt-4 space-y-1 list-decimal list-inside">
              <li>Open WhatsApp on your phone</li>
              <li>Settings &gt; Linked Devices</li>
              <li>Tap "Link a Device"</li>
              <li>Tap "Link with phone number instead"</li>
              <li>Enter the code above</li>
            </ol>
          </div>
        )}

        {qrCode && (
          <div className="mt-6 text-center">
            <p className="text-wa-dim text-sm mb-4">Scan with WhatsApp on another device</p>
            <img src={qrCode} alt="QR Code" className="mx-auto rounded-xl bg-white p-4" />
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      {status?.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} />
          {status.error}
        </div>
      )}
    </motion.div>
  );
}
