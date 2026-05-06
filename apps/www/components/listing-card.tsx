import Link from "next/link";
import type { PublicListing } from "@/lib/listings";
import { getLocalityGradient } from "@/lib/site";

function formatTimeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function badgeClasses(type: PublicListing["type"]) {
  if (type === "rent") return "border-[#1a4a2e] bg-[#0f2a1e] text-[#4ade80]";
  if (type === "sale") return "border-[#2d2d5a] bg-[#1a1a2e] text-[#818cf8]";
  return "border-[#4a2e00] bg-[#2a1a00] text-[#f59e0b]";
}

export function ListingCard({ listing }: { listing: PublicListing }) {
  const gradient = getLocalityGradient(listing.locality);
  const typeLabel = listing.type.toUpperCase();

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[#243040] bg-[#121a24] shadow-card transition duration-200 hover:-translate-y-1 hover:border-[#25d36666]"
    >
      <div className={`placeholder-grid relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradient}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className={`absolute left-4 top-4 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.18em] ${badgeClasses(listing.type)}`}>
          {typeLabel}
        </div>
        <div className="absolute right-4 top-4 rounded-full border border-white/12 bg-black/25 p-2 text-white/80">☆</div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <span className="font-display text-5xl text-white/32">{listing.locality.charAt(0)}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
            {listing.city}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[13px] text-[#a6b4c8]">{listing.locality}, {listing.area}</p>
        <p className="mt-1 text-[12px] text-[#8393a8]">
          {listing.bhk}{listing.areaSqft ? ` · ${listing.areaSqft} sqft` : ""}{listing.furnishing ? ` · ${listing.furnishing}` : ""}
        </p>

        <div className="mt-4 text-[18px] font-semibold text-white">{listing.priceLabel}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          {listing.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#2b3a4e] bg-[#101722] px-2.5 py-1 text-[11px] text-[#b7c3d4]">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 border-t border-[#243040] pt-4">
          {listing.isPro && listing.brokerPhone ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a2b20] text-sm font-semibold text-[#8ff0ad]">
                  {listing.brokerInitials}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{listing.brokerName || "Verified broker"}</div>
                  <div className="font-mono text-sm text-[#b8c7d7]">+91 {listing.brokerPhone}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="inline-flex rounded-full bg-[#25d366] px-3 py-2 text-xs font-semibold text-black">WhatsApp</span>
                <span className="inline-flex rounded-full border border-[#2b3a4e] px-3 py-2 text-xs text-[#b8c7d7]">Call</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3b2d11] text-sm font-semibold text-[#f3c66c]">🔒</div>
                <div className="space-y-1">
                  <div className="h-3 w-28 rounded-full bg-white/10 blur-[1px]" />
                  <div className="h-3 w-24 rounded-full bg-white/10 blur-[1px]" />
                </div>
              </div>
              <p className="text-[11px] text-[#f3c66c]">Broker not on PropAI Pro</p>
              <span className="inline-flex text-sm font-medium text-[#f5f7fa]">Unlock contact →</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 text-[11px] text-[#8fa1b8]">
          {formatTimeAgo(listing.createdAt)} · {listing.matchScore}% match
        </div>
      </div>
    </Link>
  );
}
