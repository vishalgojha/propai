"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, MapPin, Share2, Heart, Clock, ChevronRight, LayoutGrid, Info, ShieldCheck, Zap } from 'lucide-react';
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
    <div className="mx-auto max-w-7xl px-5 py-8 space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
        <Link href="/" className="hover:text-[var(--accent)] transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/listings" className="hover:text-[var(--accent)] transition-colors">Listings</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[var(--text-primary)] truncate max-w-[200px]">{listing.title}</span>
      </nav>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-glow)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
            {listing.type}
          </span>
          <span className="text-[11px] font-medium text-[var(--text-muted)] flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(listing.created_at))} ago
          </span>
        </div>
        
        <h1 className="text-[32px] md:text-[44px] font-bold text-[var(--text-primary)] leading-tight tracking-tight">
          {listing.title}
        </h1>
        
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4" />
          <span className="text-[16px] font-medium">{listing.locality}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-10">
          {/* Hero Data Box */}
          <div className="aspect-[21/9] w-full rounded-[32px] bg-[var(--bg-elevated)] relative overflow-hidden p-12 flex flex-col justify-center shadow-[0_32px_80px_rgba(0,0,0,0.4)] border border-white/[0.03]">
             <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent opacity-30" />
             <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
                  style={{ backgroundImage: 'radial-gradient(var(--accent) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
             
             <div className="relative z-10 max-w-4xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-glow)]">
                      <Zap className="h-3 w-3 text-[var(--accent)] fill-[var(--accent)] animate-pulse" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent)]">Direct Broker Listing</span>
                  </div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] opacity-50">
                    ID: {listing.id.slice(0, 8)} | SYNC_OK
                  </div>
                </div>
                <p className="text-[20px] md:text-[28px] font-mono leading-relaxed text-[var(--text-primary)] font-medium italic whitespace-pre-wrap">
                  {description}
                </p>
             </div>
             
             <div className="absolute bottom-0 right-0 h-32 w-64 opacity-[0.03] select-none pointer-events-none">
                <div className="absolute inset-0 bg-[var(--accent)]" style={{ clipPath: 'polygon(100% 100%, 0% 100%, 100% 0%)' }} />
             </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Configuration', value: listing.bhk ? `${listing.bhk} BHK` : 'N/A' },
              { label: 'Price', value: `₹${listing.price.toLocaleString()}` },
              { label: 'Area', value: listing.area_sqft ? `${listing.area_sqft} SQFT` : 'N/A' },
              { label: 'Furnishing', value: listing.furnishing || 'N/A' },
              { label: 'Availability', value: listing.availability || 'N/A' },
              { label: 'Floor', value: listing.floor || 'N/A' }
            ].map((stat, i) => (
              <div key={i} className="rounded-[18px] bg-[var(--bg-surface)] p-5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1.5">{stat.label}</div>
                <div className="text-[16px] font-bold text-[var(--text-primary)]">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar/Action Box */}
        <div className="space-y-6">
          <div className="sticky top-24 rounded-[28px] bg-[var(--bg-surface)] p-8 shadow-[0_32px_96px_rgba(0,0,0,0.5)] relative overflow-hidden">
             <div className="absolute -top-12 -right-12 h-24 w-24 bg-[var(--accent)]/5 blur-[40px] rounded-full" />
             
             <div className="relative z-10">
               <div className="mb-8">
                  <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5">Asking Price</div>
                  <div className="text-[36px] font-bold text-[var(--accent)] tracking-tight">₹{listing.price.toLocaleString()}</div>
               </div>

               <div className="space-y-4">
                  <button 
                    onClick={() => {
                      const phone = listing.broker_phone || '';
                      const text = encodeURIComponent(`Hi, I am interested in ${listing.title} in ${listing.locality} (via PropAI)`);
                      window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                    }}
                    className="w-full flex items-center justify-center gap-3 rounded-[16px] bg-[var(--accent)] py-4.5 text-[14px] font-bold uppercase tracking-[0.1em] text-[var(--on-propai-green)] shadow-[0_12px_32px_rgba(62,232,138,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <MessageCircle className="h-5 w-5" />
                    Contact broker
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                     <button className="flex items-center justify-center gap-2 rounded-[16px] bg-[var(--bg-elevated)] py-3.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
                        <Heart className="h-4 w-4" />
                        Save
                     </button>
                     <button className="flex items-center justify-center gap-2 rounded-[16px] bg-[var(--bg-elevated)] py-3.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
                        <Share2 className="h-4 w-4" />
                        Share
                     </button>
                  </div>
               </div>

               <div className="mt-10 pt-10 border-t border-white/[0.03]">
                  <h4 className="text-[13px] font-bold text-[var(--text-primary)] mb-5 uppercase tracking-[0.08em]">Check availability</h4>
                  <div className="space-y-4">
                     <input 
                      type="text" 
                      placeholder="Full Name"
                      className="w-full rounded-[14px] bg-[var(--bg-base)] py-4 px-5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all placeholder:text-[var(--text-muted)]"
                     />
                     <input 
                      type="tel" 
                      placeholder="Phone Number"
                      className="w-full rounded-[14px] bg-[var(--bg-base)] py-4 px-5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all placeholder:text-[var(--text-muted)]"
                     />
                     <button className="w-full rounded-[14px] border border-[var(--accent-border)] bg-[var(--accent-glow)] py-4 text-[12px] font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--on-propai-green)] transition-all">
                      Submit Request
                     </button>
                  </div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Similar Listings */}
      {related.length > 0 && (
        <section className="pt-24 space-y-10">
           <div className="flex items-baseline justify-between mb-8 border-b border-white/[0.03] pb-6">
              <div className="space-y-1">
                <h3 className="text-[28px] font-bold text-[var(--text-primary)]">Similar Properties</h3>
                <p className="text-[14px] text-[var(--text-muted)] font-medium">Fresh intelligence from the same micro-market</p>
              </div>
              <Link href="/listings" className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--accent)] hover:brightness-110 transition-all">
                View All Intelligence
              </Link>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {related.map(r => (
                <ListingCard key={r.id} listing={r} />
              ))}
           </div>
        </section>
      )}
    </div>
  );
}
