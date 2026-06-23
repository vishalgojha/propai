"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, TrendingUp, ArrowLeft, Building2 } from 'lucide-react';
import { getListingsByLocality, type PublicListing } from '@/lib/listings';
import ListingCard from '@/components/ListingCard';

export default function Locality({ slug }: { slug: string }) {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const localityName = slug?.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '';

  useEffect(() => {
    if (localityName) {
      getListingsByLocality(localityName).then(setListings);
    }
  }, [localityName]);

  const stats = {
    total: listings.length,
    rent: listings.filter(l => l.type === 'Rent').length,
    sale: listings.filter(l => l.type === 'Sale').length,
    avgRent: listings.length > 0 ? Math.floor(listings.reduce((acc, l) => acc + (l.type === 'Rent' ? l.price : 0), 0) / (listings.filter(l => l.type === 'Rent').length || 1)) : 0
  };

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-12 space-y-12">
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to all areas
        </Link>
        
        <div className="glass-panel rounded-[24px] border border-white/3 bg-[var(--bg-surface)]/60 p-6 md:p-8">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[var(--accent)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Area Intelligence</span>
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-[36px] font-bold text-[var(--text-primary)] leading-none md:text-[48px]">{localityName}</h1>
              <p className="mt-4 max-w-2xl text-[14px] leading-7 text-[var(--text-secondary)]">
                Live inventory, requirement flow, and bounce-off markets for Realtors working this belt.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-white/3 bg-[var(--bg-elevated)]/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--accent-dim)]">
                    <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Active Posts</div>
                    <div className="text-[18px] font-bold text-[var(--text-primary)]">{stats.total}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-[18px] border border-white/3 bg-[var(--bg-elevated)]/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-500/10">
                    <Building2 className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Avg Rent</div>
                    <div className="text-[18px] font-bold text-[var(--text-primary)]">₹{(stats.avgRent / 1000).toFixed(1)}k</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
        {listings.length > 0 ? (
          listings.map(l => <ListingCard key={l.id} listing={l} />)
        ) : (
          <div className="col-span-full py-32 text-center rounded-[20px] border border-dashed border-white/5 bg-[var(--bg-elevated)]/20">
            <p className="text-[var(--text-secondary)]">No active inventory in {localityName} right now. <Link href="/listings" className="text-[var(--accent)] font-bold">Browse all listings</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}
