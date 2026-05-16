export function extractAvailability(rawText: string): string | null {
  const lower = rawText.toLowerCase();
  if (/immediate|ready to move|available now/i.test(lower)) return "Immediate";
  const match = lower.match(/(\d+)\s*(days?|weeks?|months?)/i);
  if (match) {
    const num = match[1];
    const unit = match[2].toLowerCase();
    if (unit.startsWith("d")) return `${num} days`;
    if (unit.startsWith("w")) return `${num} weeks`;
    if (unit.startsWith("m")) return `${num} months`;
  }
  return null;
}

export function detectDisplayType(type: string, rawText: string): "Rent" | "Sale" | "Commercial" {
  const lower = rawText.toLowerCase();
  const isCommercial = /office|shop|showroom|warehouse|commercial|retail|outlet|godown/i.test(lower);
  if (isCommercial) return "Commercial";
  if (type === "rent") return "Rent";
  if (type === "sale") return "Sale";
  return "Rent";
}

export function extractPhoneFromRaw(text: string): string | null {
  const match = text.match(/(?:\+91[-\s]?)?([6-9]\d{9})/);
  return match ? match[1] : null;
}

export function stripPhoneNumbers(text: string): string {
  return text.replace(/(?:\+91[-\s]?)?[6-9]\d{9}/g, "[number redacted]");
}

export function generateSimilarChips(listing: { bhk: string; locality: string; type: string }) {
  return [
    { label: `${listing.bhk} · ${listing.locality}`, href: `/listings?bhk=${encodeURIComponent(listing.bhk)}&locality=${encodeURIComponent(listing.locality)}` },
    { label: `${listing.locality} · Rentals`, href: `/listings?type=rent&locality=${encodeURIComponent(listing.locality)}` },
    { label: `${listing.locality} · Sale`, href: `/listings?type=sale&locality=${encodeURIComponent(listing.locality)}` },
  ];
}
