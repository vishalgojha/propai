"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { getListings, type PublicListing } from '@/lib/listings';
import ListingCard from '@/components/ListingCard';
import { cn } from '@/lib/utils';

export default function Home({ initialListings = [], todayCount = 0 }: { initialListings?: PublicListing[]; todayCount?: number }) {
  const [listings, setListings] = useState<PublicListing[]>(initialListings.slice(0, 9));
  const [allListings, setAllListings] = useState<PublicListing[]>(initialListings);
  const [searchQuery, setSearchQuery] = useState('');
  const [rotatingWord, setRotatingWord] = useState('Rentals');
  const words = ['Rentals', 'Homes', 'Offices', 'Penthouses', 'Villas'];

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % words.length;
      setRotatingWord(words[i]);
    }, 2500);
    
    if (initialListings.length === 0) {
      getListings().then(data => {
        setAllListings(data);
        setListings(data.slice(0, 9));
      });
    }
    
    return () => clearInterval(interval);
  }, []);

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) {
      window.location.href = '/listings';
      return;
    }
    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q }),
    })
      .then(res => res.json())
      .then(data => {
        window.location.href = data.redirectTo || '/listings';
      })
      .catch(() => {
        window.location.href = `/listings?q=${encodeURIComponent(q)}`;
      });
  }, [searchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const liveCount = allListings.length;
  const freshListings = allListings.filter(l => {
    const age = Date.now() - new Date(l.created_at).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  });
  const agePool = freshListings.length > 0 ? freshListings : allListings;
  const avgAgeMinutes = agePool.length > 0
    ? Math.round(agePool.reduce((sum, l) => {
        const ms = Date.now() - new Date(l.created_at).getTime();
        return sum + ms / 60000;
      }, 0) / agePool.length)
    : 0;
  const avgAgeDisplay = avgAgeMinutes < 60 ? `${avgAgeMinutes} Mins` : `${Math.round(avgAgeMinutes / 60)} Hrs`;

  return (
    <div className="space-y-24 pb-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-8 pt-12 pb-8 flex flex-col items-center text-center">
        <div className="mx-auto max-w-7xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[rgba(62,232,138,0.12)] border border-[rgba(62,232,138,0.25)] rounded-full mb-6 animate-stream-in">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Live property feed</span>
          </div>
          
          <h1 className="text-[56px] font-bold leading-[1.1] tracking-[-0.03em] max-w-4xl mb-4 text-[var(--text-primary)]">
            Capture off-market <br/> 
            <span className="text-[var(--accent)] min-w-[200px] inline-block">{rotatingWord}</span>
            <br />
            Before they hit the portals.
          </h1>
          
          <p className="text-[var(--text-secondary)] text-[15px] max-w-xl mb-10 mx-auto leading-relaxed">
            Real-time AI organization of verified property signals across India. Direct broker connects, zero stale data.
          </p>

          <div className="w-full max-w-2xl mx-auto bg-[var(--bg-elevated)] rounded-[20px] p-2 border border-[color:var(--border-strong)] shadow-[0_24px_80px_rgba(0,0,0,0.4)] flex items-center gap-2">
            <div className="flex-1 flex items-center gap-3 px-4">
              <span className="text-[var(--text-muted)] text-lg">📍</span>
              <input 
                type="text" 
                placeholder="Search localities (e.g. Bandra West, Powai)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-transparent border-none outline-none text-sm w-full text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" 
              />
            </div>
            <div className="flex gap-1">
              <button onClick={handleSearch} className="px-6 py-2.5 rounded-[12px] text-[11px] font-bold uppercase tracking-[0.08em] bg-[var(--accent)] text-[var(--on-propai-green)] shadow-[0_10px_28px_rgba(62,232,138,0.18)] hover:brightness-110 transition-all">
                Search
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="px-8 grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-7xl mx-auto">
        {[
          { label: 'Live Listings', value: liveCount.toLocaleString() },
          { label: 'Parsed Today', value: todayCount.toLocaleString(), color: 'text-[var(--accent)]' },
          { label: 'Avg Listing Age', value: avgAgeDisplay }
        ].map((stat, i) => (
          <div key={i} className="bg-[var(--bg-surface)] border border-[color:var(--border)] rounded-[16px] p-6 shadow-sm hover:border-[color:var(--border-strong)] transition-all">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">{stat.label}</div>
            <div className={cn("text-[24px] font-bold tracking-[-0.03em]", stat.color || "text-white")}>{stat.value}</div>
          </div>
        ))}
      </section>

      {/* Fresh Inventory */}
      <section className="mx-auto max-w-7xl px-5">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Live Feed</span>
            <h2 className="text-[28px] font-bold text-[var(--text-primary)] mt-1">Just Posted by Brokers</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Newest verified real estate signals from active broker inventory.</p>
          </div>
          <Link href="/listings" className="text-[12px] font-bold text-[var(--accent)] hover:underline flex items-center gap-1 group">
            Browse All <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {listings.map(l => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      </section>

      {/* Why PropAI / Comparison */}
      <section className="mx-auto max-w-7xl px-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">The Advantage</span>
            <h2 className="text-[28px] font-bold text-[var(--text-primary)] mt-1 mb-6">Why PropAI Pulse?</h2>
            <div className="space-y-6">
              {[
                { t: 'Off-Market Before Anyone Else', d: 'Properties that never reach portals like MagicBricks — sourced directly from broker networks.' },
                { t: "Inventory That's Seconds Old", d: "Not scraped from portals. Indexed as active market inventory changes." },
                { t: 'Direct Connection', d: 'One click to request a direct conversation with the listing broker.' }
              ].map((v, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-6 w-6 rounded-full bg-[var(--accent-dim)] border border-[color:var(--accent-border)] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">{v.t}</h4>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1">{v.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-[color:var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-[var(--bg-elevated)] border-b border-[color:var(--border)]">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Feature</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">PropAI</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Portals</th>
                   </tr>
                </thead>
                <tbody className="text-[13px]">
                   {[
                      { f: 'Freshness', p: 'Seconds old', t: '24-48 hours' },
                      { f: 'Direct broker connect', p: 'Native', t: 'Rarely' },
                      { f: 'Off-market', p: '100%', t: '0%' },
                      { f: 'Spam filters', p: 'AI Level', t: 'Manual' }
                   ].map((row, i) => (
                      <tr key={i} className="border-b border-[color:var(--border)]">
                         <td className="px-6 py-4 font-medium text-[var(--text-secondary)]">{row.f}</td>
                         <td className="px-6 py-4 font-bold text-[var(--text-primary)]">{row.p}</td>
                         <td className="px-6 py-4 text-[var(--text-muted)]">{row.t}</td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="mx-auto max-w-5xl px-5 shadow-[0_24px_80px_rgba(62,232,138,0.06)]">
        <div className="rounded-[24px] bg-gradient-to-br from-[var(--bg-elevated)] to-[#0c1a12] border border-[color:var(--accent-border)] p-12 text-center">
          <h2 className="text-[32px] font-bold text-[var(--text-primary)] mb-4">Ready to secure the edge?</h2>
          <p className="text-[14px] text-[var(--text-secondary)] mb-10 max-w-xl mx-auto">
            Stop refreshing generic portals. Join the network where real estate intelligence moves first.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/listings" className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-8 py-4 text-[13px] font-bold uppercase tracking-wider text-[var(--on-propai-green)] shadow-xl hover:brightness-110 transition-all">
              Browse Listings
            </Link>
            <Link href="/broker/signup" className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-8 py-4 text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
              For Brokers
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
