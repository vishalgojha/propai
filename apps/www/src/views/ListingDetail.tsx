"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, MapPin, Share2, Heart, Clock, ChevronRight } from 'lucide-react';
import { getListingBySlug, getListings, type PublicListing } from '@/lib/listings';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import ListingCard from '@/components/ListingCard';

function buildDescription(listing: PublicListing): string {
  const parts: string[] = [];
  const dealType = listing.type === 'Requirement' ? 'Wanted' : listing.type === 'Rent' ? 'Available for rent' : 'Available for sale';
  parts.push(dealType);
  if (listing.bhk) parts.push(`${listing.bhk}`);
  if (listing.locality) parts.push(`in ${listing.locality}`);
  if (listing.furnishing) parts.push(`(${listing.furnishing})`);
  if (listing.area_sqft) parts.push(`${listing.area_sqft} sqft`);
  if (listing.availability) parts.push(`· ${listing.availability}`);
  return parts.join(' ') || 'Verified property listing';
}

export default function ListingDetail({ slug, initialListing = null }: { slug: string; initialListing?: PublicListing | null }) {
  const [listing, setListing] = useState<PublicListing | null>(initialListing);
  const [loading, setLoading] = useState(!initialListing);
  const [related, setRelated] = useState<PublicListing[]>([]);

  useEffect(() => {
    if (slug && !initialListing) {
      setLoading(true);
      getListingBySlug(slug).then(data => {
        setListing(data);
        if (data) {
          getListings().then(all => {
             const others = all.filter(l => l.id !== data.id);
             const sameLocality = others.filter(l => l.locality === data.locality);
             setRelated(sameLocality.length >= 3 ? sameLocality.slice(0, 3) : others.slice(0, 3));
          });
        }
        setLoading(false);
      });
    } else if (listing) {
      getListings().then(all => {
         const others = all.filter(l => l.id !== listing.id);
         const sameLocality = others.filter(l => l.locality === listing.locality);
         setRelated(sameLocality.length >= 3 ? sameLocality.slice(0, 3) : others.slice(0, 3));
      });
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-12 space-y-8 animate-pulse">
        <div className="h-4 w-48 bg-[var(--bg-elevated)] rounded-[4px]" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div className="h-10 w-3/4 bg-[var(--bg-elevated)] rounded-[8px]" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-[var(--bg-elevated)] rounded-[12px]" />)}
            </div>
            <div className="h-40 bg-[var(--bg-elevated)] rounded-[16px]" />
          </div>
          <div className="space-y-6">
            <div className="h-64 bg-[var(--bg-elevated)] rounded-[20px]" />
          </div>
        </div>
      </div>
    );
  }

  if (!listing) return (
     <div className="py-32 text-center mx-auto max-w-7xl px-5">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Listing not found</h2>
        <Link href="/listings" className="mt-8 inline-block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] hover:underline">
          Back to all listings
        </Link>
      </div>
  );

  const description = buildDescription(listing);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    "name": listing.title,
    "description": description,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": listing.locality,
      "addressRegion": "Maharashtra",
      "addressCountry": "IN"
    },
    "offers": {
      "@type": "Offer",
      "price": listing.price,
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-5 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
        <Link href="/" className="transition-colors hover:text-[var(--accent)]">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/listings" className="transition-colors hover:text-[var(--accent)]">Listings</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="max-w-[220px] truncate text-[var(--text-primary)]">{listing.title}</span>
      </nav>

      <section className="rounded-[28px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.24)] md:p-8">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
          <span className="inline-flex items-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-glow)] px-3 py-1 text-[var(--accent)]">
            {listing.type}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[var(--text-muted)]">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(listing.created_at))} ago
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[var(--text-secondary)]">
            <MapPin className="h-3 w-3" />
            {listing.locality}
          </span>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
          <div className="space-y-6">
            <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight text-[var(--text-primary)] md:text-[46px]">
              {listing.title}
            </h1>
            <p className="max-w-3xl text-[15px] leading-7 text-[var(--text-secondary)]">
              {description}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                listing.bhk && { label: 'Configuration', value: `${listing.bhk}`.replace(/\s*BHK$/i, '') + ' BHK' },
                listing.area_sqft && { label: 'Area', value: `${listing.area_sqft} SQFT` },
                listing.furnishing && { label: 'Furnishing', value: listing.furnishing },
                listing.availability && { label: 'Availability', value: listing.availability },
                listing.floor && { label: 'Floor', value: listing.floor },
              ]
                .filter(Boolean)
                .map((stat, index) => (
                  <span key={index} className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    {stat.label}: <span className="ml-1 text-[var(--text-primary)]">{stat.value}</span>
                  </span>
                ))}
            </div>
          </div>

          <aside className="rounded-[22px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Asking price</div>
            <div className="mt-2 text-[34px] font-bold tracking-tight text-[var(--accent)]">
              {listing.price && listing.price > 0 ? `₹${listing.price.toLocaleString()}` : 'Price on Request'}
            </div>
            <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">
              Public pages show the market signal first. Broker contact stays explicit.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={() => {
                  const phone = listing.broker_phone || '';
                  const text = encodeURIComponent(`Hi, I am interested in ${listing.title} in ${listing.locality} (via PropAI)`);
                  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                }}
                className="flex items-center justify-center gap-3 rounded-[16px] bg-[var(--accent)] py-4 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--on-propai-green)] shadow-[0_12px_32px_rgba(62,232,138,0.25)] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <MessageCircle className="h-5 w-5" />
                Contact broker
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-base)] py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]">
                  <Heart className="h-4 w-4" />
                  Save
                </button>
                <button className="flex items-center justify-center gap-2 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-base)] py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]">
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            listing.bhk && { label: 'Configuration', value: `${listing.bhk}`.replace(/\s*BHK$/i, '') + ' BHK' },
            listing.price && listing.price > 0 && { label: 'Price', value: `₹${listing.price.toLocaleString()}` },
            listing.area_sqft && { label: 'Area', value: `${listing.area_sqft} SQFT` },
            listing.furnishing && { label: 'Furnishing', value: listing.furnishing },
            listing.availability && { label: 'Availability', value: listing.availability },
            listing.floor && { label: 'Floor', value: listing.floor },
          ]
            .filter(Boolean)
            .map((stat, index) => (
              <div key={index} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{stat.label}</div>
                <div className="mt-2 text-[16px] font-bold text-[var(--text-primary)]">{stat.value}</div>
              </div>
            ))}
        </div>

        <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Public listing note</div>
          <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
            Public pages should stay title-first, locality-first, and action-first. Anything extra should help the broker decide, not decorate the page.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="pt-10 space-y-6">
          <div className="flex items-baseline justify-between border-b border-[color:var(--border)] pb-4">
            <div className="space-y-1">
              <h3 className="text-[24px] font-bold text-[var(--text-primary)]">More in this market</h3>
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">Fresh public listings from the same locality belt.</p>
            </div>
            <Link href="/listings" className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--accent)] transition-all hover:brightness-110">
              View all listings
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <ListingCard key={r.id} listing={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
