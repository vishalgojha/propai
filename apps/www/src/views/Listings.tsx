"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Filter, LayoutGrid, List as ListIcon, X } from 'lucide-react';
import { getListings, type PublicListing } from '@/lib/listings';
import ListingCard from '@/components/ListingCard';
import { cn } from '@/lib/utils';
import { neighbouringLocalities, slugifyLocalityName } from '../../lib/localities';

function normalizeLocalityQuery(value?: string | null) {
  const text = String(value || '').replace(/\+/g, ' ').trim();
  if (!text) return '';
  return text
    .split(',')
    [0]
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function Listings({ initialListings = [], initialLocality = '' }: { initialListings?: PublicListing[]; initialLocality?: string }) {
  const searchParams = useSearchParams();
  const urlLocality = normalizeLocalityQuery(searchParams.get('locality'));
  const normalizedInitialLocality = normalizeLocalityQuery(initialLocality);
  const effectiveInitialLocality = normalizedInitialLocality || urlLocality;
  const [listings, setListings] = useState<PublicListing[]>(initialListings);
  const [filters, setFilters] = useState(() => {
    const type = 'All';
    return { locality: effectiveInitialLocality, type, sort: 'Newest' };
  });

  useEffect(() => {
    let cancelled = false;

    const syncListings = async () => {
      setFilters((current) => ({
        ...current,
        locality: effectiveInitialLocality,
      }));

      if (initialListings.length > 0) {
        setListings(initialListings);
        return;
      }

      try {
        const fallbackListings = await getListings(effectiveInitialLocality || undefined);
        if (!cancelled) {
          setListings(fallbackListings);
        }
      } catch {
        if (!cancelled) {
          setListings([]);
        }
      }
    };

    void syncListings();
    return () => {
      cancelled = true;
    };
  }, [effectiveInitialLocality, initialListings]);

  const filteredListings = listings.filter(l => {
    if (filters.type !== 'All' && l.type !== filters.type) return false;
    if (filters.locality && slugifyLocalityName(l.locality) !== slugifyLocalityName(filters.locality)) return false;
    return true;
  });

  const primaryLocality = filters.locality.trim();
  const localityBelt = primaryLocality
    ? neighbouringLocalities(slugifyLocalityName(primaryLocality), 4)
    : [];
  const localityCounts = localityBelt.map((market) => ({
    ...market,
    count: listings.filter((listing) => slugifyLocalityName(listing.locality) === slugifyLocalityName(market.name)).length,
  }));

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-10">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search by locality..."
              className="w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] py-3 pl-10 pr-4 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
              value={filters.locality}
              onChange={(e) => {
                const nextLocality = normalizeLocalityQuery(e.target.value);
                setFilters(prev => ({ ...prev, locality: nextLocality }));
              }}
            />
          </div>

        <div className="flex items-center gap-4 self-end md:self-auto">
          {/* View toggle removed to focus on vertical Airbnb-style cards */}
        </div>
      </div>

      {localityCounts.length > 0 ? (
        <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Market belt</p>
              <h2 className="mt-1 text-[16px] font-bold text-[var(--text-primary)]">{primaryLocality}</h2>
            </div>
            <p className="text-[12px] text-[var(--text-secondary)]">Related localities brokers usually cross-check</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {localityCounts.map((market) => (
              <Link
                key={market.slug}
                href={`/listings?locality=${encodeURIComponent(market.name)}`}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] transition-colors"
              >
                <span>{market.name}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{market.count}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {['All', 'Rent', 'Sale'].map(type => (
          <button 
            key={type}
            onClick={() => setFilters(prev => ({ ...prev, type }))}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-all",
              filters.type === type 
                ? "border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]" 
                : "border-[color:var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            )}
          >
            {type}
          </button>
        ))}
      </div>

      {filteredListings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredListings.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="py-32 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mb-6 border border-[color:var(--border)]">
             <Filter className="h-6 w-6 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">No listings match your filters</h2>
          <p className="text-[14px] text-[var(--text-secondary)] mt-2">Try adjusting your search criteria.</p>
          <button 
            onClick={() => {
              setFilters({ locality: '', type: 'All', sort: 'Newest' });
              setListings(initialListings);
            }}
            className="mt-8 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline"
          >
            Reset all filters
          </button>
        </div>
      )}
    </div>
  );
}
