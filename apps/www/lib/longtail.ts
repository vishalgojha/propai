import type { StreamMarketItem } from "./market";
import { isRequirementType } from "./market";
import { TOP_LOCALITIES, getLocalityBySlug, localityNameFromSlug } from "./localities";

export type LongTailDeal = "rent" | "sale" | "lease" | "requirement" | null;

export type LongTailIntent = {
  slug: string;
  label: string;
  deal: LongTailDeal;
  bhkMin: number | null;
  bhkMax: number | null;
  assetHints: string[];
  requiresCommercial: boolean;
  requirementOnly: boolean;
};

export const LONGTAIL_INTENT_SLUGS = [
  "1-bhk-rent",
  "2-bhk-rent",
  "3-bhk-rent",
  "1-bhk-sale",
  "2-bhk-sale",
  "3-bhk-sale",
  "office-rent",
  "office-sale",
  "shop-rent",
  "shop-sale",
  "bare-shell-office-rent",
  "requirement-rent",
  "requirement-sale",
] as const;

export function getLongTailIntentBySlug(slug: string): LongTailIntent | null {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return null;

  const fixture = FIXED_LONGTAIL_INTENTS[normalized];
  if (fixture) {
    return fixture;
  }

  const deal = parseDeal(normalized);
  const bhk = parseBhkRange(normalized);
  const assetHints = parseAssetHints(normalized);
  if (!deal && !bhk && assetHints.length === 0) {
    return null;
  }

  return {
    slug: normalized,
    label: buildLongTailLabel(normalized, bhk, deal, assetHints),
    deal,
    bhkMin: bhk?.min ?? null,
    bhkMax: bhk?.max ?? null,
    assetHints,
    requiresCommercial: assetHints.some((hint) => ["office", "shop", "warehouse", "bare shell", "commercial"].includes(hint)),
    requirementOnly: deal === "requirement",
  };
}

export function getLongTailPageTitle(localityName: string, intent: LongTailIntent) {
  return `${intent.label} in ${localityName} | PropAI Pulse`;
}

export function getLongTailPageDescription(localityName: string, intent: LongTailIntent, listingCount: number, requirementCount: number) {
  const inventoryText = listingCount > 0
    ? `${listingCount} live listing${listingCount === 1 ? "" : "s"}`
    : "live broker inventory";
  const demandText = requirementCount > 0
    ? ` and ${requirementCount} active requirement${requirementCount === 1 ? "" : "s"}`
    : "";
  return `Broker-verified ${intent.label.toLowerCase()} in ${localityName} with ${inventoryText}${demandText}. Updated from WhatsApp inventory and ready for search engines and LLMs.`;
}

export function getLongTailStaticParams() {
  return TOP_LOCALITIES.flatMap((locality) =>
    LONGTAIL_INTENT_SLUGS.map((intentSlug) => ({
      localitySlug: locality.slug,
      intentSlug,
    })),
  );
}

export function filterLongTailItems(items: StreamMarketItem[], intent: LongTailIntent) {
  const listings = items.filter((item) => !isRequirementType(item.type) && matchesIntent(item, intent, false));
  const requirements = items.filter((item) => isRequirementType(item.type) && matchesIntent(item, intent, true));
  return { listings, requirements };
}

export function getLongTailRelatedIntents(currentSlug: string, limit = 6) {
  return LONGTAIL_INTENT_SLUGS.filter((slug) => slug !== currentSlug).slice(0, limit).map((slug) => getLongTailIntentBySlug(slug)).filter((intent): intent is LongTailIntent => Boolean(intent));
}

export function getLongTailRelatedLocalities(currentSlug: string, intentSlug: string, count = 4) {
  return TOP_LOCALITIES
    .filter((locality) => locality.slug !== currentSlug)
    .slice(0, count)
    .map((locality) => ({
      ...locality,
      title: `${getLongTailIntentBySlug(intentSlug)?.label || "Live market"} in ${locality.name}`,
    }));
}

export function getLongTailCanonicalPath(localitySlug: string, intentSlug: string) {
  return `/${localitySlug}/${intentSlug}`;
}

export function getLongTailLocalityName(slug: string) {
  return getLocalityBySlug(slug)?.name || localityNameFromSlug(slug);
}

function matchesIntent(item: StreamMarketItem, intent: LongTailIntent, allowRequirements: boolean) {
  const text = [
    item.type,
    item.bhk,
    item.price_label,
    item.locality,
    item.raw_text,
    item.deal_type,
    item.property_category,
    item.asset_class,
    item.record_type,
    JSON.stringify(item.parsed_payload || {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!allowRequirements && isRequirementType(item.type)) {
    return false;
  }

  if (intent.deal === "requirement") {
    if (!isRequirementType(item.type)) return false;
  } else if (intent.deal) {
    if (isRequirementType(item.type) && !allowRequirements) return false;
    const dealMatch = text.includes(intent.deal);
    if (!dealMatch) return false;
  }

  if (intent.bhkMin != null || intent.bhkMax != null) {
    const bhkValue = parseBhkValue(item.bhk || item.raw_text || "");
    if (bhkValue == null) return false;
    if (intent.bhkMin != null && bhkValue < intent.bhkMin) return false;
    if (intent.bhkMax != null && bhkValue > intent.bhkMax) return false;
  }

  if (intent.assetHints.length > 0) {
    const assetMatch = intent.assetHints.some((hint) => text.includes(hint));
    if (!assetMatch) return false;
  }

  if (intent.requiresCommercial) {
    if (!/commercial|office|shop|warehouse|bare shell|retail|business/i.test(text)) {
      return false;
    }
  }

  return true;
}

function parseDeal(slug: string): LongTailDeal {
  if (slug.includes("requirement") || slug.includes("wanted") || slug.includes("need")) return "requirement";
  if (slug.includes("rent") || slug.includes("lease")) return slug.includes("lease") ? "lease" : "rent";
  if (slug.includes("sale")) return "sale";
  return null;
}

function parseBhkRange(slug: string): { min: number; max: number } | null {
  const rangeMatch = slug.match(/(\d+)\s*-\s*(\d+)\s*-?\s*bhk/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  const exactMatch = slug.match(/(\d+)\s*-?\s*bhk/);
  if (exactMatch) {
    const value = Number(exactMatch[1]);
    if (Number.isFinite(value)) {
      return { min: value, max: value };
    }
  }

  return null;
}

function parseAssetHints(slug: string) {
  const hints: string[] = [];
  if (slug.includes("office")) hints.push("office");
  if (slug.includes("shop") || slug.includes("retail")) hints.push("shop");
  if (slug.includes("warehouse")) hints.push("warehouse");
  if (slug.includes("bare-shell") || slug.includes("bareshell") || slug.includes("bare shell")) hints.push("bare shell");
  if (slug.includes("commercial")) hints.push("commercial");
  if (slug.includes("residential") || slug.includes("flat") || slug.includes("apartment") || slug.includes("home")) hints.push("residential");
  if (slug.includes("villa")) hints.push("villa");
  if (slug.includes("plot") || slug.includes("land")) hints.push("plot");
  return [...new Set(hints)];
}

function parseBhkValue(value: string) {
  const text = String(value || "").toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*bhk/);
  if (match) return Number(match[1]);
  if (text.includes("studio")) return 1;
  return null;
}

function buildLongTailLabel(slug: string, bhk: { min: number; max: number } | null, deal: LongTailDeal, assetHints: string[]) {
  const bhkLabel = bhk
    ? bhk.min === bhk.max
      ? `${bhk.min} BHK`
      : `${bhk.min}-${bhk.max} BHK`
    : assetHints.find((hint) => ["office", "shop", "warehouse", "commercial"].includes(hint)) || "Live market";

  const dealLabel = deal === "lease" ? "lease" : deal || "";
  return [bhkLabel, dealLabel].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || slug.replace(/-/g, " ");
}

function getLongTailIntentBySlugFromPattern(slug: string): LongTailIntent {
  const parsed = parseBhkRange(slug);
  const deal = parseDeal(slug);
  const assetHints = parseAssetHints(slug);
  return {
    slug,
    label: buildLongTailLabel(slug, parsed, deal, assetHints),
    deal,
    bhkMin: parsed?.min ?? null,
    bhkMax: parsed?.max ?? null,
    assetHints,
    requiresCommercial: assetHints.some((hint) => ["office", "shop", "warehouse", "bare shell", "commercial"].includes(hint)),
    requirementOnly: deal === "requirement",
  };
}

const FIXED_LONGTAIL_INTENTS: Record<string, LongTailIntent> = Object.fromEntries(
  LONGTAIL_INTENT_SLUGS.map((slug) => [slug, getLongTailIntentBySlugFromPattern(slug)]),
);
