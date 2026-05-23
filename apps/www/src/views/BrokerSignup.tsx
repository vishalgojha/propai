import { CheckCircle2, MessageSquare, Zap, Target, TrendingUp } from 'lucide-react';

export default function BrokerSignup() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16 lg:py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-12">
          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--accent)] bg-[var(--accent-glow)] px-3 py-1 rounded-full border border-[color:var(--accent-border)]">Free Direct Exposure</span>
            <h1 className="text-[48px] md:text-[64px] font-bold text-[var(--text-primary)] leading-[1.05] tracking-tight">
              Get Your Listings on <span className="text-[var(--accent)]">PropAI Pulse</span>
            </h1>
            <p className="text-[18px] leading-8 text-[var(--text-secondary)] max-w-lg">
              We organize your active inventory and show it to qualified buyers. 100% streamlined. 100% direct connection to your phone.
            </p>
          </div>

          <div className="grid gap-8">
            {[
              { t: 'Automated Feed', d: 'Connect your verified broker workflow and keep active inventory visible automatically.', i: Zap },
              { t: 'Direct Connections', d: 'Buyers contact you directly on your phone. We don\'t stand in between.', i: Target },
              { t: 'Market Insights', d: 'Get data on which of your listings are trending and where demand is peaking.', i: TrendingUp }
            ].map((feature, i) => (
              <div key={i} className="flex gap-5">
                <div className="h-12 w-12 shrink-0 rounded-[12px] bg-[var(--bg-elevated)] border border-[color:var(--border)] flex items-center justify-center">
                  <feature.i className="h-6 w-6 text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-1">{feature.t}</h3>
                  <p className="text-[14px] text-[var(--text-secondary)]">{feature.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -z-10 -top-20 -right-20 h-[500px] w-[500px] bg-[var(--accent)]/5 rounded-full blur-[100px]" />
          <div className="rounded-[24px] border border-[color:var(--border-strong)] bg-[var(--bg-surface)] p-10 shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
             <div className="text-center mb-10">
                <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Ready to amplify?</h2>
                <p className="text-[13px] text-[var(--text-muted)] mt-2">No listing fees. No manual entry.</p>
             </div>

             <div className="space-y-6">
                <div>
                   <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] mb-2 block">Phone Number</label>
                   <input 
                    type="tel" 
                    placeholder="+91 98XXX XXXXX"
                    className="w-full rounded-[12px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] py-4 px-5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)] transition-all"
                   />
                </div>
                
                <div className="space-y-4">
                   <div className="flex gap-3 text-[12px] text-[var(--text-secondary)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                      <span>I agree to allow PropAI to organize my active listing information.</span>
                   </div>
                   <div className="flex gap-3 text-[12px] text-[var(--text-secondary)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                      <span>I am a RERA registered broker.</span>
                   </div>
                </div>

                <button className="w-full rounded-[14px] bg-[var(--accent)] py-5 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--on-propai-green)] shadow-2xl hover:brightness-110 transition-all">
                  Get My Listings Onboarded
                </button>
             </div>

             <div className="mt-10 p-6 rounded-[16px] bg-[var(--bg-base)] border border-dashed border-[color:var(--border)] italic">
                <p className="text-[13px] text-[var(--text-secondary)] text-center">
                  "PropAI has increased my high-end rental leads by 40% without me doing any extra work."
                </p>
                <div className="text-[11px] font-bold text-center mt-3 uppercase tracking-widest text-[var(--text-muted)]">— Premium Mumbai Broker</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
