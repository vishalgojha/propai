"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  MapPin,
  TrendingUp,
  Building2,
  ArrowRight,
  Sparkles,
  Home as HomeIcon,
  BedDouble,
} from "lucide-react";
import type { PublicListing } from "@/lib/listings";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const POPULAR_LOCALITIES = [
  "Bandra West", "Andheri West", "Powai", "Juhu", "Worli",
  "Khar West", "Lower Parel", "Chembur", "Goregaon West", "Malad West",
];

const FEATURES = [
  { icon: TrendingUp, title: "Real-time broker inventory", desc: "Listings parsed from active broker networks, not stale portal uploads." },
  { icon: Building2, title: "Direct WhatsApp connect", desc: "Contact the listing broker in one tap. No middlemen, no forms." },
  { icon: Sparkles, title: "Fresh data, every minute", desc: "New properties surface as brokers broadcast them — you see them first." },
];

export default function Home({ initialListings = [], todayCount = 0 }: { initialListings?: PublicListing[]; todayCount?: number }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [listings, setListings] = useState<PublicListing[]>(initialListings);

  useEffect(() => {
    if (initialListings.length > 0) setListings(initialListings);
  }, [initialListings]);

  const recentListings = useMemo(() => listings.slice(0, 10), [listings]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Mobile search overlay */}
      {showMobileSearch && (
        <div className="fixed inset-0 z-50 bg-[var(--bg-base)] md:hidden">
          <div className="flex items-center gap-3 p-4 border-b border-white/5">
            <div className="flex-1 flex items-center gap-3 bg-[var(--bg-surface)] rounded-xl px-4 py-2.5 border border-white/5">
              <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search locality, BHK, budget..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    router.push(`/listings?q=${encodeURIComponent(searchQuery.trim())}`);
                    setShowMobileSearch(false);
                  }
                }}
                className="w-full bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
            </div>
            <button
              onClick={() => { setShowMobileSearch(false); setSearchQuery(""); }}
              className="text-[13px] font-bold text-[var(--text-secondary)]"
            >
              Cancel
            </button>
          </div>
          <div className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-3">Popular areas</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_LOCALITIES.map((loc) => (
                <button
                  key={loc}
                  onClick={() => {
                    router.push(`/listings?locality=${encodeURIComponent(loc)}`);
                    setShowMobileSearch(false);
                  }}
                  className="rounded-full border border-white/5 bg-[var(--bg-surface)] px-3.5 py-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)] transition-colors"
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-10">
        {/* Search — always visible on desktop, tap-to-open on mobile */}
        <div className="mb-8">
          <div
            className="hidden md:flex items-center gap-3 bg-[var(--bg-surface)] rounded-2xl px-5 py-3.5 border border-white/5 hover:border-[var(--accent)]/20 transition-all cursor-text"
            onClick={() => document.getElementById("desktop-search")?.focus()}
          >
            <Search className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
            <input
              id="desktop-search"
              type="text"
              placeholder="Search locality, BHK, budget..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  router.push(`/listings?q=${encodeURIComponent(searchQuery.trim())}`);
                }
              }}
              className="w-full bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
            <button
              onClick={() => router.push("/listings")}
              className="hidden sm:inline-flex h-9 items-center rounded-xl bg-[var(--accent)] px-4 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)] hover:brightness-110 transition-all"
            >
              Browse All
            </button>
          </div>

          <button
            onClick={() => setShowMobileSearch(true)}
            className="md:hidden flex items-center gap-3 w-full bg-[var(--bg-surface)] rounded-xl px-4 py-3 border border-white/5"
          >
            <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <span className="text-[13px] text-[var(--text-muted)]">Search locality, BHK, budget...</span>
          </button>
        </div>

        {/* Quick filters — always visible */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto scrollbar-none">
          <Link
            href="/listings?type=Rent"
            className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-2 text-[12px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
          >
            For Rent
          </Link>
          <Link
            href="/listings?type=Sale"
            className="shrink-0 rounded-full border border-white/5 bg-[var(--bg-surface)] px-4 py-2 text-[12px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-colors"
          >
            For Sale
          </Link>
          <span className="shrink-0 w-px h-5 bg-white/5" />
          {POPULAR_LOCALITIES.slice(0, 5).map((loc) => (
            <Link
              key={loc}
              href={`/listings?locality=${encodeURIComponent(loc)}`}
              className="shrink-0 rounded-full border border-white/5 bg-[var(--bg-surface)] px-3.5 py-2 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-colors"
            >
              {loc}
            </Link>
          ))}
          <Link
            href="/localities"
            className="shrink-0 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors px-1"
          >
            All areas →
          </Link>
        </div>

        {/* Latest Listings */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[18px] font-black text-[var(--text-primary)] md:text-[22px]">
                Latest listings
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Fresh from broker networks
              </p>
            </div>
            <Link
              href="/listings"
              className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--accent)] hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentListings.length === 0 ? (
            <div className="rounded-2xl bg-[var(--bg-surface)]/50 p-10 text-center">
              <HomeIcon className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-3" />
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">No listings yet</p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">Check back soon for fresh inventory</p>
            </div>
          ) : (
            <>
              {/* Mobile: compact list */}
              <div className="space-y-3 md:hidden">
                {recentListings.map((item) => (
                  <Link
                    key={item.id}
                    href={`/listings/${item.slug}`}
                    className="flex items-center gap-3 rounded-xl bg-[var(--bg-surface)] p-3 border border-white/3 active:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="shrink-0 w-16 h-16 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
                      {item.cover_image ? (
                        <img src={item.cover_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <HomeIcon className="h-6 w-6 text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-[0.08em]",
                          item.type === "Rent" ? "text-[var(--accent)]" : "text-amber-400",
                        )}>
                          {item.type === "Rent" ? "Rent" : "Sale"}
                        </span>
                        {item.configuration && (
                          <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {item.configuration}
                          </span>
                        )}
                      </div>
                      <div className="text-[15px] font-black text-[var(--text-primary)] mt-0.5">
                        {formatPrice(item.price, item.type)}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.locality}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  </Link>
                ))}
              </div>
              {/* Desktop: card grid */}
              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {recentListings.map((item) => (
                  <Link
                    key={item.id}
                    href={`/listings/${item.slug}`}
                    className="group rounded-2xl bg-[var(--bg-surface)] border border-white/3 overflow-hidden hover:border-[var(--accent)]/20 transition-all"
                  >
                    <div className="aspect-[16/10] bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
                      {item.cover_image ? (
                        <img src={item.cover_image} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                      ) : (
                        <HomeIcon className="h-8 w-8 text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-[0.1em]",
                          item.type === "Rent" ? "text-[var(--accent)]" : "text-amber-400",
                        )}>
                          {item.type === "Rent" ? "For Rent" : "For Sale"}
                        </span>
                        {item.configuration && (
                          <span className="text-[11px] text-[var(--text-secondary)]">{item.configuration}</span>
                        )}
                      </div>
                      <div className="text-[18px] font-black text-[var(--text-primary)]">{formatPrice(item.price, item.type)}</div>
                      <div className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] mt-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.locality}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Why PropAI */}
        <div className="mb-12">
          <h2 className="text-[18px] font-black text-[var(--text-primary)] mb-5 md:text-[22px]">Why PropAI</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-5">
                <f.icon className="h-5 w-5 text-[var(--accent)] mb-3" />
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1">{f.title}</h3>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent border border-[var(--accent)]/20 p-6 md:p-10 text-center">
          <h2 className="text-[20px] font-black text-[var(--text-primary)] md:text-[26px]">
            Ready to find your next home?
          </h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
            Browse live listings from verified broker networks across Mumbai.
          </p>
          <div className="flex items-center justify-center gap-3 mt-5">
            <Link
              href="/listings"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)] hover:brightness-110 transition-all"
            >
              Browse Listings
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/5 bg-[var(--bg-surface)] px-5 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/20 transition-all"
            >
              View Map
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
