'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { startBroadcast, getStatus, type BroadcastResponse } from '@/lib/api';

interface BroadcastProgressProps {
  data: {
    numbers: string[];
    groupIds: string[];
    message: string;
    speedMode: 'fast' | 'safe' | 'ultra';
  };
  onReset: () => void;
}

interface LogEntry {
  type: 'sent' | 'failed' | 'delay' | 'complete' | 'error';
  number?: string;
  index?: number;
  total?: number;
  error?: string;
  duration?: number;
  message?: string;
}

export default function BroadcastProgress({ data, onReset }: BroadcastProgressProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'running' | 'complete' | 'error'>('running');
  const [stats, setStats] = useState({ sent: 0, failed: 0, total: 0 });
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    startBroadcastAndListen();
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const startBroadcastAndListen = async () => {
    const password = sessionStorage.getItem('wa_password');
    if (!password) {
      setStatus('error');
      setLogs([{ type: 'error', message: 'No password found. Please login again.' }]);
      return;
    }

    try {
      const res: BroadcastResponse = await startBroadcast({
        numbers: data.numbers,
        message: data.message,
        password,
        groupIds: data.groupIds,
        speedMode: data.speedMode,
      });

      if (res.error) {
        setStatus('error');
        setLogs([{ type: 'error', message: res.error }]);
        return;
      }

      // Start listening to SSE
      const evt = new EventSource('/api/events');
      eventSourceRef.current = evt;

      evt.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          setLogs(prev => [...prev, d]);

          if (d.type === 'sent') {
            setStats(prev => ({ ...prev, sent: prev.sent + 1 }));
            setProgress(((d.index || 0) / (d.total || 1)) * 100);
          } else if (d.type === 'failed') {
            setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
          } else if (d.type === 'complete') {
            setStats({ sent: d.sent || 0, failed: d.failed || 0, total: d.total || 0 });
            setStatus('complete');
            evt.close();
          } else if (d.type === 'error') {
            setStatus('error');
            evt.close();
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      evt.onerror = () => {
        evt.close();
      };
    } catch {
      setStatus('error');
      setLogs([{ type: 'error', message: 'Failed to start broadcast' }]);
    }
  };

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 flex flex-col"
    >
      <div className="bg-wa-card border border-wa-border rounded-2xl p-6 mb-4 flex-1">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {status === 'running' ? 'Broadcasting...' : status === 'complete' ? 'Complete!' : 'Error'}
          </h2>
          <div className="text-sm text-wa-dim">
            {stats.sent} sent, {stats.failed} failed
          </div>
        </div>

        {status === 'running' && (
          <div className="h-1.5 bg-wa-bg rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-wa-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {status === 'complete' && (
          <div className="text-center py-4 mb-4">
            <CheckCircle2 size={48} className="text-wa-primary mx-auto mb-2" />
            <p className="text-wa-text font-medium">
              {stats.sent} messages sent successfully
              {stats.failed > 0 && `, ${stats.failed} failed`}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-4 mb-4">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-400">Something went wrong</p>
          </div>
        )}

        <div ref={logRef} className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                log.type === 'sent'
                  ? 'bg-wa-primary/10 text-wa-primary'
                  : log.type === 'failed'
                  ? 'bg-red-500/10 text-red-400'
                  : log.type === 'delay'
                  ? 'bg-wa-bg text-wa-dim'
                  : log.type === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-wa-teal/10 text-wa-teal'
              }`}
            >
              <span className="flex items-center gap-2">
                {log.type === 'sent' && <CheckCircle2 size={12} />}
                {log.type === 'failed' && <XCircle size={12} />}
                {log.type === 'delay' && <Clock size={12} />}
                {log.type === 'error' && <AlertCircle size={12} />}
                {log.number || log.message || (log.type === 'delay' ? `Next in ${Math.floor((log.duration || 0) / 1000)}s` : '')}
              </span>
              {log.index && log.total && (
                <span className="text-wa-dim">{log.index}/{log.total}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {status !== 'running' && (
        <button
          onClick={onReset}
          className="w-full py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Start New Broadcast
        </button>
      )}
    </motion.div>
  );
}
