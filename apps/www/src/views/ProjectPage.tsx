"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  MapPin,
  Building2,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  BedDouble,
  Move,
  Car,
  Clock,
  Check,
  Layers,
  Calendar,
  Maximize,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "../lib/utils";
import { getProjectInventory, getSimilarProjects } from "../lib/projects";
import type { Project } from "../lib/projects";

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

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  "ready-possession": { label: "Ready Possession", class: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5" },
  delivered: { label: "Delivered", class: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/5" },
  ongoing: { label: "Ongoing", class: "text-amber-400 border-amber-400/30 bg-amber-400/5" },
};

export default function ProjectPage({ project }: { project: Project }) {
  const [activeImage, setActiveImage] = useState(0);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);

  const inventory = useMemo(() => getProjectInventory(project.slug), [project.slug]);
  const similarProjects = useMemo(() => getSimilarProjects(project.slug), [project.slug]);

  const statusInfo = STATUS_LABELS[project.status] || STATUS_LABELS["ready-possession"];

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
    if (!selectedConfig) return inventory;
    return inventory.filter((i) => i.bhk === selectedConfig);
  }, [inventory, selectedConfig]);

  const displayInventory = selectedConfig ? filteredInventory : inventory;

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Back link */}
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6">
        <Link
          href="/listings"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to listings
        </Link>
      </div>

      {/* Hero gallery */}
      <div className="mx-auto max-w-7xl px-4 mt-4 md:px-6">
        <div className="relative rounded-2xl overflow-hidden bg-[var(--bg-surface)] aspect-[16/9] md:aspect-[21/9]">
          {project.gallery[activeImage] ? (
            <img
              src={project.gallery[activeImage]}
              alt={project.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--bg-elevated)]">
              <Building2 className="h-16 w-16 text-[var(--text-muted)]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={cn("rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]", statusInfo.class)}>
                {statusInfo.label}
              </span>
              <span className="rounded-full bg-white/10 backdrop-blur-md px-3 py-0.5 text-[10px] font-bold text-white/80">
                Resale Available
              </span>
            </div>
            <h1 className="text-[28px] font-black text-white md:text-[42px]">{project.name}</h1>
            <p className="text-[14px] text-white/70 mt-1 flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {project.locality}, {project.city}
            </p>
          </div>
          {project.gallery.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5">
              {project.gallery.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    i === activeImage ? "bg-white w-6" : "bg-white/40 hover:bg-white/60",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            { label: "Starting Price", value: formatProjectPrice(project.startingPrice), icon: Star },
            { label: "Configurations", value: project.configurations.join(", "), icon: BedDouble },
            { label: "Total Towers", value: `${project.towers} Tower${project.towers > 1 ? "s" : ""}`, icon: Building2 },
            { label: "Possession", value: project.status === "ready-possession" ? "Ready" : `${project.possessionYear}`, icon: Calendar },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-[var(--bg-surface)]/50 border border-white/3 p-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">{stat.label}</div>
              <div className="flex items-center gap-2">
                <stat.icon className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                <span className="text-[14px] font-bold text-[var(--text-primary)]">{stat.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 md:px-6 mt-8 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        {/* Left column */}
        <div className="space-y-10">
          {/* Available Units */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[20px] font-black text-[var(--text-primary)]">
                  Available Units
                </h2>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  {inventory.length} unit{inventory.length !== 1 ? "s" : ""} from broker networks
                </p>
              </div>
              <Link
                href={`/project/${project.slug}/units`}
                className="text-[11px] font-bold text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Config filter pills */}
            {groupedInventory.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-4">
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
            )}

            {displayInventory.length === 0 ? (
              <div className="rounded-2xl bg-[var(--bg-surface)]/50 p-8 text-center border border-white/3">
                <Building2 className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">No units currently listed</p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">Check back for fresh inventory from broker networks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayInventory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-[var(--bg-surface)] border border-white/3 p-4 hover:border-[var(--accent)]/20 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-[0.08em]">
                            {item.bhk}
                          </span>
                          {item.listingRef && (
                            <span className="text-[9px] font-bold text-[var(--text-muted)]">#{item.listingRef}</span>
                          )}
                        </div>
                        <div className="text-[20px] font-black text-[var(--text-primary)]">
                          {formatProjectPrice(item.price)}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1">
                            <Maximize className="h-3 w-3" />
                            {item.carpetArea} sqft
                          </span>
                          <span className="flex items-center gap-1">
                            <Move className="h-3 w-3" />
                            {item.furnishing}
                          </span>
                          <span className="flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            Floor {item.floor}
                          </span>
                          {item.parking > 0 && (
                            <span className="flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              {item.parking} Parking
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                          <Clock className="h-3 w-3" />
                          {formatDate(item.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Project Overview */}
          <section>
            <h2 className="text-[20px] font-black text-[var(--text-primary)] mb-5">Project Overview</h2>
            <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-6">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-6">{project.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Developer", value: project.developer },
                  { label: "Location", value: `${project.locality}, ${project.city}` },
                  { label: "Status", value: statusInfo.label },
                  { label: "Completion", value: String(project.possessionYear) },
                  { label: "Towers", value: String(project.towers) },
                  { label: "Floors", value: String(project.floors) },
                  { label: "Total Units", value: String(project.totalUnits) },
                  { label: "Configurations", value: project.configurations.join(", ") },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{row.label}</div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] mt-1">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Amenities */}
          <section>
            <h2 className="text-[20px] font-black text-[var(--text-primary)] mb-5">Amenities</h2>
            <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(showAllAmenities ? project.amenities : project.amenities.slice(0, 8)).map((amenity) => (
                  <div key={amenity} className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10">
                      <Check className="h-4 w-4 text-[var(--accent)]" />
                    </div>
                    <span className="text-[12px] font-medium text-[var(--text-primary)]">{amenity}</span>
                  </div>
                ))}
              </div>
              {project.amenities.length > 8 && (
                <button
                  onClick={() => setShowAllAmenities(!showAllAmenities)}
                  className="mt-4 flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  {showAllAmenities ? "Show less" : `Show all ${project.amenities.length} amenities`}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllAmenities && "rotate-180")} />
                </button>
              )}
            </div>
          </section>

          {/* Floor Plans */}
          <section>
            <h2 className="text-[20px] font-black text-[var(--text-primary)] mb-5">Floor Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(showAllPlans ? project.floorPlans : project.floorPlans.slice(0, 3)).map((plan) => (
                <div key={plan.bhk} className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-5 text-center hover:border-[var(--accent)]/20 transition-all">
                  <div className="flex items-center justify-center h-20 mb-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/5">
                      <BedDouble className="h-7 w-7 text-[var(--accent)]" />
                    </div>
                  </div>
                  <h3 className="text-[18px] font-black text-[var(--text-primary)]">{plan.bhk}</h3>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1">{plan.area} sqft carpet</p>
                </div>
              ))}
            </div>
            {project.floorPlans.length > 3 && (
              <button
                onClick={() => setShowAllPlans(!showAllPlans)}
                className="mt-4 flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
              >
                {showAllPlans ? "Show less" : `Show all ${project.floorPlans.length} plans`}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllPlans && "rotate-180")} />
              </button>
            )}
          </section>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Nearby */}
          <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-4">Nearby</h3>
            <div className="space-y-3">
              {project.nearby.map((place) => (
                <div key={place.label} className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-[var(--accent)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">{place.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{place.distance}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Similar Projects */}
          {similarProjects.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-4">Similar Projects</h3>
              <div className="space-y-3">
                {similarProjects.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/project/${p.slug}`}
                    className="block rounded-xl bg-[var(--bg-surface)]/50 border border-white/3 p-4 hover:border-[var(--accent)]/20 transition-all"
                  >
                    <p className="text-[13px] font-bold text-[var(--text-primary)]">{p.name}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {formatProjectPrice(p.startingPrice)} · {p.configurations.join(", ")}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-transparent border border-[var(--accent)]/20 p-5">
            <p className="text-[12px] font-bold text-[var(--text-primary)] mb-1">Interested in this project?</p>
            <p className="text-[11px] text-[var(--text-secondary)] mb-4">Connect with a listing professional for site visits and negotiations.</p>
            <a
              href={`https://wa.me/919820098200?text=Hi%2C%20I%27m%20interested%20in%20${encodeURIComponent(project.name)}%20in%20${encodeURIComponent(project.locality)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)] hover:brightness-110 transition-all"
            >
              Contact Listing Professional
            </a>
          </div>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-[var(--bg-base)]/95 backdrop-blur-xl border-t border-white/5 p-3">
        <div className="flex gap-2">
          <Link
            href={`/project/${project.slug}/units`}
            className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[10px] font-black uppercase tracking-[0.08em] text-[var(--on-propai-green)]"
          >
            View Available Units ({inventory.length})
          </Link>
          <a
            href={`https://wa.me/919820098200?text=Hi%2C%20I%27m%20interested%20in%20${encodeURIComponent(project.name)}`}
            target="_blank"
            rel="noreferrer"
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-white/5 bg-[var(--bg-surface)]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--accent)]" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
