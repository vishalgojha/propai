"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  MapPin,
  Building2,
  Users,
  BarChart3,
  Search,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPriceShort } from "../../lib/market";
import type { LocalityMarketData } from "../../lib/market";

type SortKey = "activity" | "demand" | "rent" | "sale" | "name";
type FilterType = "all" | "high_demand" | "balanced" | "oversupplied";

export default function MarketIntelligence({ initialData }: { initialData: LocalityMarketData[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = [...initialData];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) => l.locality.toLowerCase().includes(q));
    }

    if (filterType !== "all") {
      result = result.filter((l) => l.demandSignal === filterType);
    }

    switch (sortBy) {
      case "activity":
        result.sort((a, b) => (b.listingCount + b.requirementCount) - (a.listingCount + a.requirementCount));
        break;
      case "demand":
        result.sort((a, b) => {
          const priority: Record<string, number> = { high_demand: 0, balanced: 1, oversupplied: 2 };
          return (priority[a.demandSignal] ?? 1) - (priority[b.demandSignal] ?? 1);
        });
        break;
      case "rent":
        result.sort((a, b) => (b.avgRent ?? 0) - (a.avgRent ?? 0));
        break;
      case "sale":
        result.sort((a, b) => (b.avgSale ?? 0) - (a.avgSale ?? 0));
        break;
      case "name":
        result.sort((a, b) => a.locality.localeCompare(b.locality));
        break;
    }

    return result;
  }, [initialData, sortBy, filterType, searchQuery]);

  const totals = useMemo(() => {
    return initialData.reduce(
      (acc, l) => ({
        listings: acc.listings + l.listingCount,
        requirements: acc.requirements + l.requirementCount,
        brokers: acc.brokers + l.brokerCount,
        localities: acc.localities + 1,
      }),
      { listings: 0, requirements: 0, brokers: 0, localities: 0 },
    );
  }, [initialData]);

  const demandSignalLabel = (signal: string) => {
    switch (signal) {
      case "high_demand":
        return { label: "High Demand", class: "border-blue-500/30 bg-blue-500/10 text-blue-300" };
      case "oversupplied":
        return { label: "Oversupplied", class: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
      default:
        return { label: "Balanced", class: "border-[var(--accent-border)] bg-[var(--accent-glow)] text-[var(--accent)]" };
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Hero */}
      <section className="relative border-b border-white/3 bg-gradient-to-b from-[var(--bg-surface)]/60 to-transparent">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-16">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-glow)] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)] mb-5">
              <BarChart3 className="h-3.5 w-3.5" />
              Mumbai Market Insights
            </div>
            <h1 className="text-[34px] font-black leading-tight tracking-[-0.02em] text-[var(--text-primary)] font-display md:text-[48px]">
              See Which Mumbai Areas Are
              <span className="text-[var(--accent)]"> Heating Up</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[14px] leading-7 text-[var(--text-secondary)]">
              Real-time market intelligence from active broker networks across Mumbai.
              Track pricing trends, demand shifts, and supply velocity — updated every 30 minutes.
            </p>
          </div>

          {/* KPI row */}
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Active Localities", value: totals.localities, icon: MapPin },
              { label: "Fresh Listings", value: totals.listings.toLocaleString(), icon: Building2 },
              { label: "Buyer Signals", value: totals.requirements.toLocaleString(), icon: TrendingUp },
              { label: "Active Brokers", value: totals.brokers.toLocaleString(), icon: Users },
            ].map((stat, i) => (
              <div key={i} className="rounded-2xl bg-[var(--bg-surface)]/40 p-4 border border-white/3">
                <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1.5">
                  <stat.icon className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{stat.label}</span>
                </div>
                <div className="text-[22px] font-black text-[var(--text-primary)]">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        {/* Controls bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search locality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/5 bg-[var(--bg-surface)]/40 py-2.5 pl-10 pr-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-border)] transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1 rounded-xl border border-white/5 p-1 bg-[var(--bg-surface)]/20">
              {(["all", "high_demand", "balanced", "oversupplied"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-all",
                    filterType === f
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                  )}
                >
                  {f === "all" ? "All" : f === "high_demand" ? "High Demand" : f === "balanced" ? "Balanced" : "Oversupplied"}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-xl border border-white/5 px-4 py-2 text-[11px] font-bold text-[var(--text-secondary)] sm:hidden"
            >
              Filters
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showFilters && "rotate-180")} />
            </button>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-xl border border-white/5 bg-[var(--bg-surface)]/40 px-3.5 py-2.5 text-[11px] font-bold text-[var(--text-secondary)] outline-none cursor-pointer"
            >
              <option value="activity">Sort: Most Active</option>
              <option value="demand">Sort: Highest Demand</option>
              <option value="rent">Sort: Avg Rent</option>
              <option value="sale">Sort: Avg Sale</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>

        {/* Mobile filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 mb-6 sm:hidden">
            {(["all", "high_demand", "balanced", "oversupplied"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-all border",
                  filterType === f
                    ? "bg-[var(--accent-glow)] border-[var(--accent-border)] text-[var(--accent)]"
                    : "border-white/5 text-[var(--text-muted)]",
                )}
              >
                {f === "all" ? "All Markets" : f === "high_demand" ? "🔥 High Demand" : f === "balanced" ? "⚖️ Balanced" : "⚠️ Oversupplied"}
              </button>
            ))}
          </div>
        )}

        {/* Locality grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <BarChart3 className="h-12 w-12 text-[var(--text-muted)] mb-4" />
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">No localities match your filter</p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">Try adjusting the search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((loc) => {
              const signal = demandSignalLabel(loc.demandSignal);
              return (
                <Link
                  key={loc.slug}
                  href={`/listings?locality=${encodeURIComponent(loc.locality)}`}
                  className="group relative rounded-2xl border border-white/3 bg-[var(--bg-surface)]/30 p-5 transition-all hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-surface)]/50"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-[16px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                        {loc.locality}
                      </h3>
                      <span className="text-[11px] text-[var(--text-muted)]">{loc.topBhk || "Mixed"} most common</span>
                    </div>
                    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]", signal.class)}>
                      {signal.label}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-[var(--bg-base)]/60 p-3">
                      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">Listings</div>
                      <div className="text-[18px] font-black text-[var(--text-primary)]">{loc.listingCount}</div>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-base)]/60 p-3">
                      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">Demand</div>
                      <div className="text-[18px] font-black text-[var(--text-primary)]">{loc.requirementCount}</div>
                    </div>
                  </div>

                  {/* Price trends */}
                  <div className="space-y-2 border-t border-white/3 pt-3">
                    {loc.avgRent && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-secondary)]">Avg Rent</span>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-blue-400" />
                          <span className="text-[12px] font-bold text-[var(--text-primary)]">{formatPriceShort(loc.avgRent)}/mo</span>
                        </div>
                      </div>
                    )}
                    {loc.avgSale && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-secondary)]">Avg Sale</span>
                        <div className="flex items-center gap-1.5">
                          <TrendingDown className="h-3 w-3 text-emerald-400" />
                          <span className="text-[12px] font-bold text-[var(--text-primary)]">{formatPriceShort(loc.avgSale)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[var(--text-secondary)]">Active Brokers</span>
                      <span className="text-[12px] font-bold text-[var(--text-primary)]">{loc.brokerCount}</span>
                    </div>
                  </div>

                  {/* Arrow indicator */}
                  <ArrowRight className="absolute bottom-5 right-5 h-4 w-4 text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="rounded-3xl border border-[var(--accent-border)] bg-gradient-to-br from-[var(--accent-glow)] via-transparent to-transparent p-8 md:p-12">
          <div className="max-w-2xl">
            <h2 className="text-[22px] font-black text-[var(--text-primary)] md:text-[28px]">
              Looking for a specific property?
            </h2>
            <p className="mt-3 text-[14px] text-[var(--text-secondary)] leading-relaxed">
              Browse live listings from verified broker networks across all Mumbai localities.
              Filter by rent, sale, BHK configuration, and budget.
            </p>
            <Link
              href="/listings"
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-[12px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)] transition-all hover:brightness-110"
            >
              Browse Live Listings
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
