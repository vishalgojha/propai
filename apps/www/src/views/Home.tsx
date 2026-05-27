"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
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

      {/* Data-first summary */}
      <section className="mx-auto max-w-7xl px-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">What this page gives you</span>
            <h2 className="mt-1 text-[28px] font-bold text-[var(--text-primary)]">Listings, locality context, and direct broker access.</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { t: 'Fresh inventory', d: 'Visible as soon as it is parsed.' },
                { t: 'Locality context', d: 'Move from market to market without guessing.' },
                { t: 'Direct contact', d: 'Open the broker chat when a record is worth calling.' },
              ].map((v) => (
                <div key={v.t} className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                  <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">{v.t}</h4>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{v.d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Top belts</span>
            <h2 className="mt-1 text-[24px] font-bold text-[var(--text-primary)]">Common markets brokers jump between.</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Bandra West', 'Khar West', 'Santacruz West', 'Andheri West', 'Powai', 'Worli', 'Lower Parel', 'Chembur'].map((loc) => (
                <Link
                  key={loc}
                  href={`/listings?locality=${encodeURIComponent(loc)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] transition-colors"
                >
                  <MapPin className="h-3 w-3" />
                  {loc}
                </Link>
              ))}
            </div>
            <p className="mt-5 text-[13px] leading-6 text-[var(--text-secondary)]">
              The public site should feel like an inventory index, not a brochure. The useful work is the listing, locality, and broker connection.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5">
        <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Use it like a working desk</h2>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                Search a locality, open the feed, and move straight to the broker when the record is strong enough.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/listings" className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-5 py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--on-propai-green)] shadow-xl hover:brightness-110 transition-all">
                Browse Listings
              </Link>
              <Link href="/broker/signup" className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-5 py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
                For Brokers
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
