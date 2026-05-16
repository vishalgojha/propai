"use client";

import { useState } from "react";
import Link from "next/link";
import type { PublicListing } from "@/lib/listings";
import { extractAvailability, detectDisplayType, generateSimilarChips } from "@/lib/parse-listing";

function formatTimeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function badgeColors(displayType: "Rent" | "Sale" | "Commercial") {
  if (displayType === "Rent") return "bg-[#E1F5EE] text-[#085041]";
  if (displayType === "Sale") return "bg-[#E6F1FB] text-[#0C447C]";
  return "bg-[#EEEDFE] text-[#3C3489]";
}

export function ListingCard({ listing, view = "grid" }: { listing: PublicListing; view?: "grid" | "list" }) {
  const [expanded, setExpanded] = useState(false);
  const rawText = listing.rawText || listing.description || "";

  const displayType = detectDisplayType(listing.type, rawText);
  const availability = extractAvailability(rawText);

  const titleParts = [listing.bhk];
  if (listing.areaSqft) titleParts.push(`${listing.areaSqft.toLocaleString("en-IN")} sqft`);
  if (listing.furnishing) titleParts.push(listing.furnishing);
  const displayTitle = titleParts.join(" · ");

  const rawExcerpt = rawText
    ? `"${rawText.slice(0, 120)}${rawText.length > 120 ? "..." : ""}"`
    : null;

  const pills = [
    listing.bhk,
    listing.areaSqft ? `${listing.areaSqft.toLocaleString("en-IN")} sqft` : null,
    listing.furnishing,
    listing.floor,
    availability,
  ].filter(Boolean) as string[];

  const detailFields = [
    { label: "Type", value: displayType },
    { label: "Configuration", value: listing.bhk },
    { label: "Area", value: listing.areaSqft ? `${listing.areaSqft.toLocaleString("en-IN")} sqft` : "—" },
    { label: "Furnishing", value: listing.furnishing || "—" },
    { label: "Availability", value: availability || "—" },
    { label: "Locality", value: listing.locality },
  ];

  const similarChips = generateSimilarChips(listing);

  function handleConnect(e: React.MouseEvent) {
    e.stopPropagation();
    window.location.href = `/api/connect?id=${listing.id}`;
  }

  if (view === "list") {
    return (
      <div className="rounded-2xl border border-[#243040] bg-[#121a24]/80 p-4 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0c2230] to-[#1a5d43] text-lg text-white/60">
            {listing.locality.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badgeColors(displayType)}`}>
                {displayType}
              </span>
              <span className="whitespace-nowrap text-[11px] text-[#64748b]">{formatTimeAgo(listing.createdAt)}</span>
            </div>
            <div className="mt-1 text-[15px] font-medium text-white leading-snug">{displayTitle}</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-[#94a3b8]">📍 {listing.locality}</div>
            <div className="mt-1 text-lg font-medium text-white">{listing.priceLabel}</div>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            className="shrink-0 rounded-lg bg-[#25d366] px-3.5 py-2 text-xs font-semibold text-black hover:brightness-110"
          >
            Connect
          </button>
        </div>

        {rawExcerpt && (
          <div className="mt-3 border-l-2 border-[#243040] pl-2.5 text-xs text-[#94a3b8] leading-relaxed">
            {rawExcerpt}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[#64748b]">Via broker network</span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 text-xs text-[#94a3b8]"
          >
            {expanded ? "Less" : "More details"}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-[#243040] pt-3">
            <div className="grid grid-cols-3 gap-2">
              {detailFields.map((f) => (
                <div key={f.label}>
                  <div className="text-[11px] text-[#64748b]">{f.label}</div>
                  <div className="text-[13px] font-medium text-white">{f.value}</div>
                </div>
              ))}
            </div>
            {rawText && (
              <div>
                <div className="mb-1 flex items-center gap-1 text-[11px] text-[#64748b]">Original broker message</div>
                <div className="rounded-lg border border-[#243040] bg-[#0d1117] p-3 text-xs leading-relaxed text-[#94a3b8]">
                  &ldquo;{rawText}&rdquo;
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 text-xs font-medium text-[#94a3b8]">More like this</div>
              <div className="flex flex-wrap gap-1.5">
                {similarChips.map((chip) => (
                  <Link
                    key={chip.label}
                    href={chip.href}
                    className="rounded-lg border border-[#243040] bg-[#0d1117] px-2.5 py-1 text-xs text-[#94a3b8] hover:border-[#25d36666] hover:text-white"
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 rounded-2xl border border-[#243040] bg-[#121a24]/80 p-4 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badgeColors(displayType)}`}>
            {displayType}
          </span>
          <span className="whitespace-nowrap text-[11px] text-[#64748b]">{formatTimeAgo(listing.createdAt)}</span>
        </div>

        <div>
          <div className="text-[15px] font-medium leading-snug text-white">{displayTitle}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-[#94a3b8]">📍 {listing.locality}</div>
        </div>

        <div className="text-lg font-medium text-white">{listing.priceLabel}</div>

        <div className="flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-[#243040] bg-[#0d1117] px-2.5 py-1 text-xs text-[#94a3b8]"
            >
              {pill}
            </span>
          ))}
        </div>

        {rawExcerpt && (
          <div className="border-l-2 border-[#243040] pl-2.5 text-xs leading-relaxed text-[#94a3b8]">
            {rawExcerpt}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[#64748b]">Via broker network</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-xs text-[#94a3b8]"
            >
              {expanded ? "Less" : "More details"}
            </button>
            <button
              type="button"
              onClick={handleConnect}
              className="rounded-lg bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110"
            >
              Connect
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div
          className="-mt-px space-y-3 rounded-2xl border border-[#243040] bg-[#0d1117]/80 p-4"
          style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        >
          <div className="grid grid-cols-3 gap-2">
            {detailFields.map((f) => (
              <div key={f.label}>
                <div className="text-[11px] text-[#64748b]">{f.label}</div>
                <div className="text-[13px] font-medium text-white">{f.value}</div>
              </div>
            ))}
          </div>
          {rawText && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] text-[#64748b]">Original broker message</div>
              <div className="rounded-lg border border-[#243040] bg-[#121a24] p-3 text-xs leading-relaxed text-[#94a3b8]">
                &ldquo;{rawText}&rdquo;
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 text-xs font-medium text-[#94a3b8]">More like this</div>
            <div className="flex flex-wrap gap-1.5">
              {similarChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  className="rounded-lg border border-[#243040] bg-[#121a24] px-2.5 py-1 text-xs text-[#94a3b8] hover:border-[#25d36666] hover:text-white"
                >
                  {chip.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
