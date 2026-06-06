"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, MessageSquare, Send, CheckCircle, AlertCircle } from 'lucide-react';

export default function Contact() {
  const searchParams = useSearchParams();
  const topic = searchParams.get('topic') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (topic) {
      setMessage(`I'm reaching out regarding: ${topic}\n\n`);
    }
  }, [topic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setSubmitting(true);
    setStatus('idle');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim(), topic: topic || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
        <div className="space-y-12">
          <div className="space-y-4">
            <h1 className="text-[48px] font-bold text-[var(--text-primary)] leading-tight tracking-tight">Contact Us</h1>
            <p className="text-[17px] text-[var(--text-secondary)] leading-relaxed max-w-lg font-medium">
              Have a question or feedback? We read every message and reply within 24 hours.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center text-[var(--accent)]">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] uppercase tracking-widest mb-1">Email</h3>
                <p className="text-[15px] text-[var(--text-secondary)]">hello@propai.live</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] uppercase tracking-widest mb-1">Support</h3>
                <p className="text-[15px] text-[var(--text-secondary)]">24/7 technical assistance</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] bg-[var(--bg-surface)] p-10 shadow-[0_32px_80px_rgba(0,0,0,0.4)] border border-white/[0.03] space-y-8">
          <div className="space-y-2">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Send a Message</h2>
            <p className="text-[13px] text-[var(--text-muted)] font-medium">Our team usually responds within 24 hours.</p>
            {topic && (
              <p className="text-[11px] text-[var(--accent)] font-bold uppercase tracking-wider">
                Topic: {topic}
              </p>
            )}
          </div>

          {status === 'success' ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <CheckCircle className="h-12 w-12 text-[var(--accent)]" />
              <p className="text-[16px] font-bold text-[var(--text-primary)]">Message sent!</p>
              <p className="text-[13px] text-[var(--text-secondary)]">We'll get back to you within 24 hours.</p>
              <button
                onClick={() => setStatus('idle')}
                className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)] hover:underline mt-2"
              >
                Send another
              </button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Full Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-[16px] bg-[var(--bg-base)] border-none py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Email</label>
                <input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-[16px] bg-[var(--bg-base)] border-none py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Message</label>
                <textarea
                  rows={4}
                  placeholder="Tell us what you need..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  className="w-full rounded-[16px] bg-[var(--bg-base)] border-none py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all resize-none"
                />
              </div>

              {status === 'error' && (
                <div className="flex items-center gap-2 text-[12px] text-red-400 bg-red-500/10 rounded-xl px-4 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-3 rounded-[18px] bg-[var(--accent)] py-5 text-[14px] font-bold uppercase tracking-[0.15em] text-[var(--on-propai-green)] shadow-[0_12px_40px_rgba(62,232,138,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {submitting ? (
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
