"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, TrendingUp, Filter, ArrowLeft, Building2 } from 'lucide-react';
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
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to all areas
        </Link>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-[var(--accent)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Area Intelligence</span>
            </div>
            <h1 className="text-[36px] font-bold text-[var(--text-primary)] leading-none">{localityName}</h1>
          </div>

          <div className="flex gap-4">
             <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-[var(--accent-dim)] flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                   <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Active Posts</div>
                   <div className="text-[18px] font-bold text-[var(--text-primary)]">{stats.total}</div>
                </div>
             </div>
             <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {listings.length > 0 ? (
          listings.map(l => <ListingCard key={l.id} listing={l} />)
        ) : (
          <div className="col-span-full py-32 text-center rounded-[20px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)]/30">
            <p className="text-[var(--text-secondary)]">No active inventory in {localityName} right now. <Link href="/listings" className="text-[var(--accent)] font-bold">Browse all listings</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}
