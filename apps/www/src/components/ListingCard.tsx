"use client";

import React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { MapPin, BedDouble, Move, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice, formatBhk, buildDescription } from '@/lib/format';
import type { PublicListing } from '@/lib/listings';

interface ListingCardProps {
  listing: PublicListing;
  view?: 'grid' | 'list';
  key?: React.Key;
}



export default function ListingCard({ listing }: ListingCardProps) {
  const description = buildDescription(listing);

  const formattedPrice = formatPrice(listing.price, listing.type);

  const features = [];
  const bhkLabel = formatBhk(listing.bhk);
  if (bhkLabel) features.push(bhkLabel);
  if (listing.raw_text?.toLowerCase().includes('furnish')) features.push('Furnished');
  if (listing.raw_text?.toLowerCase().includes('parking')) features.push('Parking');
  if (listing.raw_text?.toLowerCase().includes('sea view') || listing.raw_text?.toLowerCase().includes('ocean')) features.push('Sea View');
  if (listing.raw_text?.toLowerCase().includes('metro')) features.push('Metro Nearby');

  return (
    <Link href={`/listings/${listing.slug}`} className="group block animate-stream-in">
      <div className="h-full rounded-[24px] border border-[color:rgba(255,255,255,0.08)] bg-[var(--bg-elevated)] p-6 relative overflow-hidden transition-all duration-300 shadow-[0_10px_28px_rgba(0,0,0,0.16)] hover:-translate-y-1 hover:bg-[var(--bg-surface)] hover:border-[color:var(--accent-border)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/22 to-transparent opacity-70" />
        <div className="absolute -top-32 -right-32 h-64 w-64 bg-[var(--accent)]/3 blur-[100px] rounded-full group-hover:bg-[var(--accent)]/8 transition-all duration-700" />
        
        <div className="flex flex-col h-full justify-between relative z-10">
          <div className="space-y-6">
            {/* Header: Title and Type */}
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1.5">
                <h3 className="text-[19px] font-bold text-[var(--text-primary)] leading-[1.28] group-hover:text-[var(--accent)] transition-colors duration-300">
                  {listing.title}
                </h3>
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] font-medium">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] opacity-80">
                    <MapPin className="h-3 w-3" />
                  </div>
                  <span>{listing.locality}</span>
                </div>
              </div>
              <span className={cn(
                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] backdrop-blur-md",
                listing.type === 'Rent' ? "bg-[var(--propai-green)]/10 text-[var(--propai-green)]" : 
                listing.type === 'Sale' ? "bg-amber-500/10 text-amber-500" :
                "bg-blue-500/10 text-blue-400"
              )}>
                {listing.type}
              </span>
            </div>

            {/* Short Description */}
            {description ? (
              <p className="text-[14px] leading-relaxed text-[var(--text-secondary)] font-medium">
                {description}
              </p>
            ) : null}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 pt-2">
              {bhkLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                  <BedDouble className="h-3.5 w-3.5" />
                  {bhkLabel}
                </span>
              )}
              {listing.area_sqft && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                  <Move className="h-3.5 w-3.5" />
                  {listing.area_sqft} sqft
                </span>
              )}
              {features.map((f, i) => (
                <span key={i} className="rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] transition-colors group-hover:border-[color:var(--accent-border)] group-hover:text-[var(--text-primary)]">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Footer Area */}
          <div className="mt-7 pt-5 border-t border-[color:rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[26px] font-bold text-[var(--text-primary)] tracking-tight">
                {formattedPrice}
                {listing.type === 'Rent' && <span className="text-[14px] ml-1 text-[var(--text-muted)] font-medium">/mo</span>}
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--accent)]/10 px-5 py-3 text-[11px] font-bold text-[var(--accent)] uppercase tracking-wider">
              Verified
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
