"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { getListings, type PublicListing } from "@/lib/listings";
import ListingCard from "@/components/ListingCard";
import { cn } from "@/lib/utils";
import { neighbouringLocalities, slugifyLocalityName } from "../../lib/localities";

const BHK_OPTIONS = ["1 BHK", "2 BHK", "3 BHK", "4+ BHK"];
const BUDGET_RANGES = [
  { label: "Under ₹50K", min: 0, max: 50000 },
  { label: "₹50K–₹1L", min: 50000, max: 100000 },
  { label: "₹1L–₹2L", min: 100000, max: 200000 },
  { label: "₹2L–₹5L", min: 200000, max: 500000 },
  { label: "₹5L+", min: 500000, max: Infinity },
];

function normalizeLocalityQuery(value?: string | null) {
  const text = String(value || "").replace(/\+/g, " ").trim();
  if (!text) return "";
  return text.split(",")[0].trim().replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function matchBhk(configuration: string | number | null | undefined, bhkFilter: string): boolean {
  if (!configuration) return bhkFilter === "1 BHK";
  const cfg = String(configuration).replace(/\s+/g, "").toLowerCase();
  if (bhkFilter === "1 BHK") return cfg.includes("1bhk") || cfg === "1" || cfg.includes("1rk");
  if (bhkFilter === "2 BHK") return cfg.includes("2bhk") || cfg === "2";
  if (bhkFilter === "3 BHK") return cfg.includes("3bhk") || cfg === "3";
  if (bhkFilter === "4+ BHK") {
    const num = parseInt(cfg);
    return num >= 4 || cfg.includes("4bhk") || cfg.includes("5bhk") || cfg.includes("4+");
  }
  return true;
}

function matchBudget(price: number | null | undefined, range: typeof BUDGET_RANGES[number]): boolean {
  if (price === null || price === undefined) return false;
  return price >= range.min && price < range.max;
}

export default function Listings({ initialListings = [], initialLocality = "", initialQuery = "" }: {
  initialListings?: PublicListing[];
  initialLocality?: string;
  initialQuery?: string;
}) {
  const searchParams = useSearchParams();
  const urlLocality = normalizeLocalityQuery(searchParams.get("locality"));
  const urlQuery = searchParams.get("q") || "";
  const urlType = searchParams.get("type") || "";
  const effectiveLocality = initialLocality || urlLocality;
  const effectiveQuery = initialQuery || urlQuery;
  const effectiveType = urlType || "All";

  const [listings, setListings] = useState<PublicListing[]>(initialListings);
  const [filters, setFilters] = useState({ locality: effectiveLocality, query: effectiveQuery, type: effectiveType, bhk: "", budget: "" });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (initialListings.length > 0) {
        setListings(initialListings);
        return;
      }
      try {
        const data = await getListings(effectiveLocality || undefined);
        if (!cancelled) setListings(data);
      } catch { if (!cancelled) setListings([]); }
    };
    sync();
    return () => { cancelled = true; };
  }, [effectiveLocality, initialListings]);

  const filteredListings = useMemo(() => listings.filter((l) => {
    if (filters.type !== "All" && l.type !== filters.type) return false;
    if (filters.locality && slugifyLocalityName(l.locality) !== slugifyLocalityName(filters.locality)) return false;
    if (filters.bhk && !matchBhk(l.configuration, filters.bhk)) return false;
    if (filters.budget) {
      const range = BUDGET_RANGES.find((r) => r.label === filters.budget);
      if (range && !matchBudget(l.price, range)) return false;
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const title = (l.title || "").toLowerCase();
      const locality = (l.locality || "").toLowerCase();
      const raw = (l.raw_text || "").toLowerCase();
      if (!title.includes(q) && !locality.includes(q) && !raw.includes(q)) return false;
    }
    return true;
  }), [listings, filters]);

  const primaryLocality = filters.locality.trim();
  const localityBelt = primaryLocality ? neighbouringLocalities(slugifyLocalityName(primaryLocality), 4) : [];
  const localityCounts = localityBelt.map((m) => ({
    ...m,
    count: listings.filter((l) => slugifyLocalityName(l.locality) === slugifyLocalityName(m.name)).length,
  }));

  return (
    <div className="mx-auto max-w-7xl px-0 md:px-6 py-0 md:py-10">
      {/* Mobile: sticky top bar */}
      <div className="md:hidden sticky top-0 z-20 bg-[var(--bg-base)] border-b border-white/5">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-xl px-4 py-2.5 border border-white/5">
            <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Search locality..."
              value={filters.query}
              onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
              className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
          {["All", "Rent", "Sale"].map((type) => (
            <button
              key={type}
              onClick={() => setFilters((p) => ({ ...p, type }))}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-[11px] font-bold transition-all",
                filters.type === type
                  ? "bg-[var(--accent)] text-[var(--on-propai-green)]"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-white/5",
              )}
            >
              {type === "All" ? "All" : type === "Rent" ? "For Rent" : "For Sale"}
            </button>
          ))}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold transition-all border",
              showFilters ? "border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent)]/5" : "border-white/5 text-[var(--text-secondary)] bg-[var(--bg-surface)]",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
        </div>
        {/* Expandable filters */}
        {showFilters && (
          <div className="px-4 pb-3 space-y-3 border-b border-white/5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-2">BHK</p>
              <div className="flex flex-wrap gap-1.5">
                {["", ...BHK_OPTIONS].map((bhk) => (
                  <button
                    key={bhk || "any"}
                    onClick={() => setFilters((p) => ({ ...p, bhk }))}
                    className={cn(
                      "rounded-full px-3 py-1 text-[10px] font-bold transition-all",
                      filters.bhk === bhk
                        ? "bg-[var(--accent)] text-[var(--on-propai-green)]"
                        : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-white/5",
                    )}
                  >
                    {bhk || "Any"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-2">Budget</p>
              <div className="flex flex-wrap gap-1.5">
                {["", ...BUDGET_RANGES.map((r) => r.label)].map((budget) => (
                  <button
                    key={budget || "any"}
                    onClick={() => setFilters((p) => ({ ...p, budget }))}
                    className={cn(
                      "rounded-full px-3 py-1 text-[10px] font-bold transition-all",
                      filters.budget === budget
                        ? "bg-[var(--accent)] text-[var(--on-propai-green)]"
                        : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-white/5",
                    )}
                  >
                    {budget || "Any"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop header */}
      <div className="hidden md:grid md:grid-cols-[1fr_420px] md:items-end md:gap-6 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-glow)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Public listings
          </div>
          <h1 className="mt-4 text-[32px] font-black leading-tight text-[var(--text-primary)] font-display md:text-[44px]">
            Find homes from active Mumbai broker networks
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-7 text-[var(--text-secondary)]">
            Browse rentals and sale inventory, compare essential details, and contact the listing broker directly.
          </p>
        </div>
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search locality, building, 3 BHK..."
            className="h-12 w-full rounded-[12px] border border-[color:var(--border-strong)] bg-[var(--bg-surface)]/75 py-3 pl-10 pr-4 text-[13px] text-[var(--text-primary)] shadow-sm outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[color:var(--accent-border)]"
            value={filters.query}
            onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value, locality: "" }))}
          />
        </div>
      </div>

      {/* Desktop filter bar */}
      <div className="hidden md:flex items-center gap-3 mb-8 overflow-x-auto scrollbar-none">
        {["All", "Rent", "Sale"].map((type) => (
          <button
            key={type}
            onClick={() => setFilters((p) => ({ ...p, type }))}
            className={cn(
              "shrink-0 rounded-full px-5 py-2 text-[11px] font-black uppercase tracking-[0.1em] transition-all",
              filters.type === type
                ? "bg-[var(--accent)] text-[#020f07] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-white/5",
            )}
          >
            {type === "All" ? "All" : type === "Rent" ? "For Rent" : "For Sale"}
          </button>
        ))}
        <span className="w-px h-6 bg-white/5" />
        {BHK_OPTIONS.map((bhk) => (
          <button
            key={bhk}
            onClick={() => setFilters((p) => ({ ...p, bhk: p.bhk === bhk ? "" : bhk }))}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-[11px] font-semibold transition-all border",
              filters.bhk === bhk
                ? "border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent)]/5"
                : "border-white/5 text-[var(--text-secondary)] bg-[var(--bg-surface)]",
            )}
          >
            {bhk}
          </button>
        ))}
        <span className="w-px h-6 bg-white/5" />
        {BUDGET_RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setFilters((p) => ({ ...p, budget: p.budget === r.label ? "" : r.label }))}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-[11px] font-semibold transition-all border",
              filters.budget === r.label
                ? "border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent)]/5"
                : "border-white/5 text-[var(--text-secondary)] bg-[var(--bg-surface)]",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Desktop locality belt */}
      {localityCounts.length > 0 && (
        <div className="hidden md:block rounded-[20px] bg-[var(--bg-surface)]/50 backdrop-blur-md p-5 border border-white/3 shadow-sm mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/2 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Market belt</p>
              <h2 className="mt-1.5 text-[18px] font-black text-[var(--text-primary)] font-display">{primaryLocality}</h2>
            </div>
            <p className="text-[11.5px] text-[var(--text-secondary)]">Related localities brokers usually cross-check</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {localityCounts.map((market) => (
              <Link
                key={market.slug}
                href={`/listings?locality=${encodeURIComponent(market.name)}`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-elevated)]/80 px-3.5 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-all"
              >
                <span>{market.name}</span>
                <span className="text-[9px] font-bold bg-[var(--bg-base)] px-2 py-0.5 rounded text-[var(--text-muted)]">{market.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mobile count */}
      <div className="md:hidden px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)]">
        {filteredListings.length.toLocaleString()} {filteredListings.length === 1 ? "home" : "homes"} found
      </div>

      {/* Listings grid */}
      {filteredListings.length > 0 ? (
        <>
          {/* Mobile: compact list */}
          <div className="md:hidden px-4 pb-20 space-y-3">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} compact />
            ))}
          </div>
          {/* Desktop: card grid */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8 pb-10">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      ) : (
        <div className="py-24 text-center space-y-4 px-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center mb-6">
            <SlidersHorizontal className="h-5 w-5 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">No listings match your filters</h2>
          <p className="text-[12.5px] text-[var(--text-secondary)] mt-1">Try adjusting your search criteria.</p>
          <button
            onClick={() => setFilters({ locality: "", query: "", type: "All", bhk: "", budget: "" })}
            className="mt-6 text-[10.5px] font-black uppercase tracking-[0.12em] text-[var(--accent)] hover:underline"
          >
            Reset all filters
          </button>
        </div>
      )}
    </div>
  );
}
