import React from 'react';
import { Mail, MessageSquare, MapPin, Send } from 'lucide-react';

export default function Contact() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
        <div className="space-y-12">
          <div className="space-y-4">
            <h1 className="text-[48px] font-bold text-[var(--text-primary)] leading-tight tracking-tight">Contact Us</h1>
            <p className="text-[17px] text-[var(--text-secondary)] leading-relaxed max-w-lg font-medium">
              Have questions about our intelligence mesh or broker network? Reach out to our technical support team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="h-10 w-10 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center text-[var(--accent)]">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] uppercase tracking-widest mb-1">Email</h3>
                <p className="text-[15px] text-[var(--text-secondary)]">hello@propai.pulse</p>
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

          <div className="p-8 rounded-[24px] bg-[var(--bg-elevated)] border border-[color:var(--border)] relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)]" />
            <div className="relative z-10 flex items-start gap-4">
              <MapPin className="h-6 w-6 text-[var(--accent)] shrink-0 mt-1" />
              <div>
                <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-2">Technical HQ</h3>
                <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                  BKC Financial District<br />
                  Bandra East, Mumbai<br />
                  Maharashtra 400051
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] bg-[var(--bg-surface)] p-10 shadow-[0_32px_80px_rgba(0,0,0,0.4)] border border-white/[0.03] space-y-8">
          <div className="space-y-2">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Send a Message</h2>
            <p className="text-[13px] text-[var(--text-muted)] font-medium">Our team usually responds within 2 hours.</p>
          </div>

          <form className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Full Name</label>
              <input 
                type="text" 
                placeholder="Name"
                className="w-full rounded-[16px] bg-[var(--bg-base)] border-none py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Work Email</label>
              <input 
                type="email" 
                placeholder="Email address"
                className="w-full rounded-[16px] bg-[var(--bg-base)] border-none py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Message</label>
              <textarea 
                rows={4}
                placeholder="Tell us what you need..."
                className="w-full rounded-[16px] bg-[var(--bg-base)] border-none py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all resize-none"
              />
            </div>
            <button className="w-full flex items-center justify-center gap-3 rounded-[18px] bg-[var(--accent)] py-5 text-[14px] font-bold uppercase tracking-[0.15em] text-[var(--on-propai-green)] shadow-[0_12px_40px_rgba(62,232,138,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all">
              <Send className="h-4 w-4" />
              Transmit Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
