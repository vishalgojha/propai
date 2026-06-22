"use client";

import React from 'react';
import Link from 'next/link';
import { MapPin, BedDouble, Move, MessageCircle, ArrowUpRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice, formatBhk, buildDescription } from '@/lib/format';
import type { PublicListing } from '@/lib/listings';

interface ListingCardProps {
  listing: PublicListing;
}

export default function ListingCard({ listing }: ListingCardProps) {
  const description = buildDescription(listing);
  const formattedPrice = formatPrice(listing.price, listing.type);
  const coverImage = listing.cover_image || listing.images?.[0] || null;
  const detailsHref = `/listings/${listing.slug}`;
  const contact = listing.contacts?.[0] || null;
  const contactHref = contact?.waLink || null;
  const contactLabel = contact?.name ? `Contact ${contact.name.split(' ')[0]}` : 'Contact broker';
  const typeLabel = listing.type === 'Rent' ? 'For rent' : listing.type === 'Sale' ? 'For sale' : 'Requirement';
  const configurationLabel = formatBhk(listing.configuration);
  const tags = [
    configurationLabel,
    listing.area_sqft ? `${listing.area_sqft} sqft` : null,
    listing.furnishing || null,
    listing.floor || null,
  ].filter(Boolean).slice(0, 4);

  const imageSection = coverImage ? (
    <img
      src={coverImage}
      alt={listing.title}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
    />
  ) : (
    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,rgba(62,232,138,0.10),rgba(59,130,246,0.08)_48%,rgba(255,255,255,0.03))]">
      <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--bg-surface)]/75 text-[var(--accent)] shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
        <Home className="h-7 w-7" />
      </div>
    </div>
  );

  return (
    <article className="group flex h-full animate-stream-in flex-col overflow-hidden rounded-[18px] border border-[color:var(--border-strong)] bg-[var(--bg-surface)] shadow-[0_14px_36px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--accent-border)] hover:shadow-[0_22px_46px_rgba(0,0,0,0.22)]">
      <Link href={detailsHref} className="relative block aspect-[4/3] overflow-hidden bg-[var(--bg-elevated)]">
        {imageSection}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className={cn(
            "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] shadow-sm backdrop-blur-md",
            listing.type === 'Rent' ? "bg-[var(--propai-green)] text-[var(--on-propai-green)]" :
            listing.type === 'Sale' ? "bg-amber-400 text-[#211400]" :
            "bg-blue-400 text-[#06121f]"
          )}>
            {typeLabel}
          </span>
          {listing.ref_no ? (
            <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white/85 backdrop-blur-md">
              {listing.ref_no}
            </span>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Link href={detailsHref} className="block">
              <h3 className="line-clamp-2 text-[18px] font-bold leading-[1.25] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                {listing.title}
              </h3>
            </Link>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
              <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="truncate">{listing.locality}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[20px] font-black leading-none tracking-tight text-[var(--text-primary)]">
              {formattedPrice}
            </div>
          </div>
        </div>

        {description ? (
          <p className="mt-4 line-clamp-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}

        <div className="mt-4 grid min-h-16 grid-cols-2 gap-2">
          {tags.length > 0 ? tags.map((tag, index) => (
            <div key={`${tag}-${index}`} className="flex items-center gap-2 rounded-[12px] bg-[var(--bg-elevated)]/65 px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)]">
              {index === 0 ? <BedDouble className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Move className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
              <span className="truncate">{tag}</span>
            </div>
          )) : (
            <div className="col-span-2 rounded-[12px] bg-[var(--bg-elevated)]/65 px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)]">
              Details available on request
            </div>
          )}
        </div>

        <div className="mt-auto flex gap-2 pt-5">
          <Link
            href={detailsHref}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)]/55 px-4 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
          >
            View details
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          {contactHref ? (
            <a
              href={contactHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-4 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)] transition-all hover:brightness-110"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {contactLabel}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
