"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Move, Car, Layers, Clock, Maximize, Search } from "lucide-react";
import { cn } from "../lib/utils";
import type { Project, ProjectInventory } from "../lib/projects";

function formatProjectPrice(price: number): string {
  const cr = price / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`;
  const l = price / 100000;
  return `₹${l.toFixed(0)} L`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ProjectUnits({
  project,
  inventory,
}: {
  project: Project;
  inventory: ProjectInventory[];
}) {
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"price-asc" | "price-desc" | "area-asc" | "area-desc" | "latest">("latest");
  const [searchQuery, setSearchQuery] = useState("");

  const groupedInventory = useMemo(() => {
    const groups = new Map<string, typeof inventory>();
    for (const item of inventory) {
      const existing = groups.get(item.bhk) || [];
      existing.push(item);
      groups.set(item.bhk, existing);
    }
    return Array.from(groups.entries()).sort();
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    let items = inventory;
    if (selectedConfig) {
      items = items.filter((i) => i.bhk === selectedConfig);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.bhk.toLowerCase().includes(q) ||
          i.furnishing.toLowerCase().includes(q) ||
          i.floor.toLowerCase().includes(q) ||
          (i.listingRef && i.listingRef.toLowerCase().includes(q)) ||
          String(i.carpetArea).includes(q),
      );
    }
    return items;
  }, [inventory, selectedConfig, searchQuery]);

  const sortedInventory = useMemo(() => {
    const items = [...filteredInventory];
    switch (sortBy) {
      case "price-asc":
        return items.sort((a, b) => a.price - b.price);
      case "price-desc":
        return items.sort((a, b) => b.price - a.price);
      case "area-asc":
        return items.sort((a, b) => a.carpetArea - b.carpetArea);
      case "area-desc":
        return items.sort((a, b) => b.carpetArea - a.carpetArea);
      case "latest":
      default:
        return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  }, [filteredInventory, sortBy]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20 md:pb-0">
      {/* Header */}
      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-6">
        <Link
          href={`/project/${project.slug}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {project.name}
        </Link>

        <div className="mt-4 mb-6">
          <h1 className="text-[22px] font-black text-[var(--text-primary)]">Available Units</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            {inventory.length} unit{inventory.length !== 1 ? "s" : ""} from broker networks in {project.name}, {project.locality}
          </p>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by BHK, furnishing, area..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 rounded-xl border border-white/5 bg-[var(--bg-surface)] pl-10 pr-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/40 transition-colors"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-11 rounded-xl border border-white/5 bg-[var(--bg-surface)] px-4 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40 transition-colors"
          >
            <option value="latest">Latest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="area-asc">Area: Small to Large</option>
            <option value="area-desc">Area: Large to Small</option>
          </select>
        </div>

        {/* Config filter pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedConfig(null)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[10px] font-bold transition-all",
              !selectedConfig
                ? "bg-[var(--accent)] text-[var(--on-propai-green)]"
                : "border border-white/5 text-[var(--text-secondary)] hover:text-[var(--accent)]",
            )}
          >
            All ({inventory.length})
          </button>
          {groupedInventory.map(([bhk, items]) => (
            <button
              key={bhk}
              onClick={() => setSelectedConfig(bhk)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[10px] font-bold transition-all",
                selectedConfig === bhk
                  ? "bg-[var(--accent)] text-[var(--on-propai-green)]"
                  : "border border-white/5 text-[var(--text-secondary)] hover:text-[var(--accent)]",
              )}
            >
              {bhk} ({items.length})
            </button>
          ))}
        </div>

        {/* Inventory count */}
        {filteredInventory.length !== inventory.length && (
          <p className="text-[11px] text-[var(--text-muted)] mb-4">
            Showing {filteredInventory.length} of {inventory.length} units
          </p>
        )}

        {/* Units grid */}
        {sortedInventory.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-surface)]/50 p-12 text-center border border-white/3">
            <p className="text-[16px] font-bold text-[var(--text-primary)]">No units match your filter</p>
            <button
              onClick={() => {
                setSelectedConfig(null);
                setSearchQuery("");
              }}
              className="mt-2 text-[12px] text-[var(--accent)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedInventory.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-[var(--bg-surface)] border border-white/3 p-5 hover:border-[var(--accent)]/20 transition-all"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[var(--accent)] uppercase tracking-[0.08em]">
                        {item.bhk}
                      </span>
                      {item.listingRef && (
                        <span className="text-[9px] font-bold text-[var(--text-muted)]">#{item.listingRef}</span>
                      )}
                    </div>
                    <div className="text-[24px] font-black text-[var(--text-primary)] mt-1">
                      {formatProjectPrice(item.price)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
                    <Clock className="h-3 w-3" />
                    {formatDate(item.updatedAt)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5">
                    <Maximize className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    {item.carpetArea} sqft
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Move className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    {item.furnishing}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    Floor {item.floor}
                  </span>
                  {item.parking > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      {item.parking} Parking
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-[var(--bg-base)]/95 backdrop-blur-xl border-t border-white/5 p-3">
        <a
          href={`https://wa.me/919820098200?text=Hi%2C%20I%27m%20interested%20in%20units%20at%20${encodeURIComponent(project.name)}%20in%20${encodeURIComponent(project.locality)}`}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[10px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)]"
        >
          Inquire About Units
        </a>
      </div>
    </div>
  );
}
