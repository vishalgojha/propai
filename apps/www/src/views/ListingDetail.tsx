"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, MapPin, Bell, Clock, ChevronRight, CheckCircle, Phone, X, BedDouble, Move, IndianRupee, Building } from 'lucide-react';
import { getListingBySlug, getListings, type PublicListing } from '@/lib/listings';
import { formatPrice } from '@/lib/format';
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
  return parts.join(' ') || 'Direct Realtor listing';
}

export default function ListingDetail({ 
  slug, 
  initialListing = null, 
  initialRelated = [] 
}: { 
  slug: string; 
  initialListing?: PublicListing | null; 
  initialRelated?: PublicListing[];
}) {
  const [listing, setListing] = useState<PublicListing | null>(initialListing);
  const [loading, setLoading] = useState(!initialListing);
  const [related, setRelated] = useState<PublicListing[]>(initialRelated);
  const [notifyState, setNotifyState] = useState<'idle' | 'form' | 'submitting' | 'done'>('idle');
  const [notifyPhone, setNotifyPhone] = useState('');
  const [notifyError, setNotifyError] = useState('');
  const [aiDescription, setAiDescription] = useState<string | null>(null);
  const [descLoading, setDescLoading] = useState(false);

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = notifyPhone.replace(/\D/g, '');
    const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setNotifyError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setNotifyError('');
    setNotifyState('submitting');
    try {
      const res = await fetch('/api/listings/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing?.id, phone: notifyPhone }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      setNotifyState('done');
    } catch {
      setNotifyError('Could not save. Try again.');
      setNotifyState('form');
    }
  };

  useEffect(() => {
    if (slug && !initialListing) {
      setLoading(true);
      fetch(`/api/listings?slug=${encodeURIComponent(slug)}`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch");
          return res.json();
        })
        .then(data => {
          setListing(data.listing || null);
          setRelated(data.related || []);
          setLoading(false);
        })
        .catch(() => {
          setListing(null);
          setRelated([]);
          setLoading(false);
        });
    } else {
      setListing(initialListing);
      setRelated(initialRelated || []);
      setLoading(false);
    }
  }, [slug, initialListing, initialRelated]);

  useEffect(() => {
    if (!listing || aiDescription !== null) return;
    setDescLoading(true);
    fetch("/api/listings/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price: listing.price,
        configuration: listing.bhk ? `${listing.bhk}`.replace(/\s*BHK$/i, "") + " BHK" : null,
        locality: listing.locality,
        area_sqft: listing.area_sqft,
        created_at: listing.created_at,
        deal_type: listing.type,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setAiDescription(data.description || null);
        setDescLoading(false);
      })
      .catch(() => setDescLoading(false));
  }, [listing, aiDescription]);


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

      {/* Main detail wrapper - clean borderless glass panel */}
      <section className="rounded-[28px] border border-white/3 bg-[var(--bg-surface)]/60 backdrop-blur-md p-6 shadow-[0_24px_70px_rgba(0,0,0,0.24)] md:p-8">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
          <span className="inline-flex items-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-glow)] px-3 py-1 text-[var(--accent)]">
            {listing.type}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elevated)]/85 px-3 py-1 text-[var(--text-secondary)]">
            <Clock className="h-3 w-3 text-[var(--accent)]" />
            {formatDistanceToNow(new Date(listing.created_at))} ago
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elevated)]/85 px-3 py-1 text-[var(--text-secondary)]">
            <MapPin className="h-3 w-3 text-[var(--accent)]" />
            {listing.locality}
          </span>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
          <div className="space-y-6">
            <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight text-[var(--text-primary)] md:text-[46px] font-display">
              {listing.title}
            </h1>
            <p className="max-w-3xl text-[15px] leading-7 text-[var(--text-secondary)] font-medium">
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
                  <span key={index} className="inline-flex items-center rounded-full bg-[var(--bg-elevated)]/80 px-3.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    {stat.label}: <span className="ml-1 text-[var(--text-primary)] font-bold">{stat.value}</span>
                  </span>
                ))}
            </div>
          </div>

            <aside className="rounded-[22px] bg-[var(--bg-surface)] p-5 border border-white/3 shadow-sm space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Asking price</div>
              <div className="mt-2 text-[34px] font-black tracking-tight text-[var(--accent)]">
                {formatPrice(listing.price, listing.type)}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {notifyState === 'done' ? (
                <div className="flex items-center justify-center gap-2 rounded-[16px] bg-[var(--accent-glow)] py-4 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  <CheckCircle className="h-4 w-4" />
                  We'll notify you!
                </div>
              ) : notifyState === 'form' || notifyState === 'submitting' ? (
                <form onSubmit={handleNotifySubmit} className="space-y-2">
                  <div className="flex items-center gap-2 rounded-[14px] bg-[var(--bg-elevated)]/40 px-3 py-2">
                    <Phone className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <input
                      type="tel"
                      placeholder="Your WhatsApp number"
                      value={notifyPhone}
                      onChange={(e) => setNotifyPhone(e.target.value)}
                      className="bg-transparent border-none outline-none text-[12px] w-full text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      autoFocus
                      disabled={notifyState === 'submitting'}
                    />
                  </div>
                  {notifyError && (
                    <p className="text-[10px] text-red-400 px-1">{notifyError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={notifyState === 'submitting'}
                      className="flex-1 flex items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] py-3 text-[10px] font-black uppercase tracking-wider text-[var(--on-propai-green)] transition-all disabled:opacity-50"
                    >
                      {notifyState === 'submitting' ? (
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                      {notifyState === 'submitting' ? 'Saving...' : 'Notify Me'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifyState('idle')}
                      className="px-3 rounded-[14px] bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/75 text-[10px] font-bold text-[var(--text-muted)] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setNotifyState('form')}
                  className="flex items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] py-3 text-[11px] font-black uppercase tracking-wider text-[var(--on-propai-green)] hover:brightness-110 active:scale-[0.98] transition-all shadow-md"
                >
                  <Bell className="h-4 w-4" />
                  Notify Me
                </button>
              )}
            </div>
          </aside>
        </div>
      </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              listing.bhk && { label: 'BHK', value: `${listing.bhk}`.replace(/\s*BHK$/i, '') + ' BHK', icon: BedDouble },
              listing.area_sqft && { label: 'Area', value: `${listing.area_sqft} sqft`, icon: Move },
              listing.price && listing.price > 0 && { label: 'Price', value: formatPrice(listing.price), icon: IndianRupee },
              listing.type && { label: 'Deal Type', value: listing.type, icon: Building },
              listing.furnishing && { label: 'Furnishing', value: listing.furnishing },
              listing.availability && { label: 'Availability', value: listing.availability },
              listing.floor && { label: 'Floor', value: listing.floor },
            ]
              .filter(Boolean)
              .map((stat, index) => (
                <div key={index} className="rounded-[18px] bg-[var(--bg-surface)]/60 backdrop-blur-md p-4.5 border border-white/2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {stat.icon && <stat.icon className="h-3.5 w-3.5" />}
                    {stat.label}
                  </div>
                  <div className="mt-2 text-[16px] font-black text-[var(--text-primary)]">{stat.value}</div>
                </div>
            ))}
        </div>

        {descLoading ? (
          <div className="rounded-[24px] bg-[var(--bg-surface)]/40 backdrop-blur-md p-6 border border-white/2 animate-pulse">
            <div className="h-4 w-32 bg-[var(--bg-elevated)] rounded-[4px] mb-4" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-[var(--bg-elevated)] rounded-[3px]" />
              <div className="h-3 w-5/6 bg-[var(--bg-elevated)] rounded-[3px]" />
              <div className="h-3 w-4/6 bg-[var(--bg-elevated)] rounded-[3px]" />
            </div>
          </div>
        ) : aiDescription ? (
          <div className="rounded-[24px] bg-[var(--bg-surface)]/40 backdrop-blur-md p-6 border border-white/2">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)] mb-4">About this listing</div>
            <div
              className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed text-[var(--text-secondary)] [&_strong]:text-[var(--text-primary)] [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-[var(--text-primary)] [&_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: aiDescription }}
            />
          </div>
        ) : null}

        <div className="rounded-[24px] bg-[var(--bg-surface)]/60 backdrop-blur-md p-6 border border-white/2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Interested in this property?</div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)] font-medium">
            Get direct broker contact and exclusive details by signing up to PropAI Pulse — the real-time broker network platform.
          </p>
          <a
            href="https://app.propai.live"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] py-3.5 text-[12px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)] transition-all hover:brightness-110"
          >
            <MessageCircle className="h-4 w-4" />
            Connect on PropAI
          </a>
        </div>
      </div>

      {related.length > 0 && (
        <section className="pt-10 space-y-6">
          <div className="flex items-baseline justify-between border-b border-white/2 pb-4">
            <div className="space-y-1">
              <h3 className="text-[24px] font-bold text-[var(--text-primary)] font-display">More in this market</h3>
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">Fresh public listings from the same locality belt.</p>
            </div>
            <Link href="/listings" className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--accent)] transition-all hover:brightness-110">
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
