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

const typeLabel = (type: PublicListing["type"]) => type.toUpperCase();

export function ListingCard({ listing, view = "grid" }: { listing: PublicListing; view?: "grid" | "list" }) {
  const gradient = getLocalityGradient(listing.locality);

  if (view === "list") {
    return (
      <div className="listing-card-hover flex items-start gap-4 rounded-2xl border border-[#243040] bg-[#121a24]/80 p-4 shadow-card">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-lg`}>
          {listing.locality.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/listings/${listing.id}`} className="truncate text-sm font-medium text-white hover:text-[#25d366]">
              {listing.title}
            </Link>
            <span className="shrink-0 rounded-full border border-[#1a4a2e] bg-[#0f2a1e] px-2 py-0.5 text-[10px] text-[#4ade80]">
              {formatTimeAgo(listing.createdAt)}
            </span>
          </div>
          <div className="mt-1 text-xs text-[#94a3b8]">
            {listing.locality}{listing.area ? `, ${listing.area}` : ""}
            <span className="mx-1.5">·</span>
            {listing.bhk}{listing.areaSqft ? ` · ${listing.areaSqft} sqft` : ""}{listing.furnishing ? ` · ${listing.furnishing}` : ""}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-sm">
            <span className="font-medium text-white">{listing.priceLabel}</span>
            {listing.brokerPhone ? (
              <a
                href={`https://wa.me/91${listing.brokerPhone}?text=${encodeURIComponent(`Hi, I saw your listing "${listing.title}" on PropAI. Is it still available?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-[#25d366] px-3 py-1 text-xs font-semibold text-black hover:brightness-110"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] text-[#0F6E56]">
            Posted in broker WhatsApp network
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[#243040] bg-[#121a24] shadow-card transition duration-200 hover:-translate-y-1 hover:border-[#25d36666]"
    >
      <div className={`placeholder-grid relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradient}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className={`absolute left-4 top-4 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.18em] ${badgeClasses(listing.type)}`}>
          {typeLabel(listing.type)}
        </div>
        <div className="absolute right-4 top-4 rounded-full border border-white/12 bg-black/25 px-2 py-1 text-[10px] text-white/80">
          {formatTimeAgo(listing.createdAt)}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <span className="font-display text-5xl text-white/32">{listing.locality.charAt(0)}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
            {listing.city}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[13px] text-[#a6b4c8]">{listing.locality}{listing.area ? `, ${listing.area}` : ""}</p>
        <p className="mt-1 text-[12px] text-[#8393a8]">
          {listing.bhk}{listing.areaSqft ? ` · ${listing.areaSqft} sqft` : ""}{listing.furnishing ? ` · ${listing.furnishing}` : ""}
        </p>

        <div className="mt-3 text-[18px] font-semibold text-white">{listing.priceLabel}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          {listing.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#2b3a4e] bg-[#101722] px-2.5 py-1 text-[11px] text-[#b7c3d4]">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 border-t border-[#243040] pt-4">
          {listing.brokerPhone ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a2b20] text-sm font-semibold text-[#8ff0ad]">
                  {listing.brokerInitials}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{listing.brokerName || "Verified broker"}</div>
                  <div className="font-mono text-xs text-[#b8c7d7]">+91 {listing.brokerPhone}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/91${listing.brokerPhone}?text=${encodeURIComponent(`Hi, I saw your listing "${listing.title}" on PropAI. Is it still available?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-2 text-xs font-semibold text-black hover:brightness-110"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              </div>
              <div className="text-[10px] text-[#0F6E56]">
                Posted in broker WhatsApp network
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
              <p className="text-[11px] text-[#f3c66c]">Contact broker to inquire</p>
              <span className="inline-flex text-sm font-medium text-[#f5f7fa]">View details →</span>
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
