export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.propai.live";

export const topLocalities = [
  "Bandra West",
  "Powai",
  "Andheri West",
  "Worli",
  "Kandivali",
  "Borivali",
  "Juhu",
  "Goregaon",
  "Malad",
  "Dadar",
  "Chembur",
  "Thane"
];

export const nearbyLocalities: Record<string, string[]> = {
  "bandra-west": ["Khar West", "Santacruz West", "Juhu"],
  "powai": ["Kanjurmarg", "Andheri East", "Ghatkopar East"],
  "andheri-west": ["Juhu", "Versova", "Lokhandwala"],
  "worli": ["Lower Parel", "Dadar West", "Prabhadevi"]
};

export const localityDescriptions: Record<string, string> = {
  "bandra-west": "Bandra West stays busy because it blends sea-facing residential pockets with premium retail streets and quick access to core business zones. Demand spans family homes, celebrity-grade apartments, and broker-led rental inventory that turns over fast.",
  "powai": "Powai combines large-format gated housing, lake-view towers, and a strong rental market driven by professionals and founders. Listings tend to move on furnishing quality, tower reputation, and access to Hiranandani and SEEPZ corridors.",
  "andheri-west": "Andheri West is one of the deepest live markets for rentals, offices, and mixed-use stock. Inventory ranges from compact apartments to commercial floors, with pricing shifting block by block around Lokhandwala, Versova, and DN Nagar.",
  "worli": "Worli sits at the premium end of the city with high-rise sale inventory, sea-facing homes, and corporate demand. Larger-format apartments and branded towers dominate, so price per square foot is often the critical comparison metric."
};

export const localityGradientMap: Record<string, string> = {
  bandra: "from-[#0c2230] via-[#11414a] to-[#1a5d43]",
  powai: "from-[#082028] via-[#0e4d56] to-[#12373d]",
  worli: "from-[#121d3b] via-[#1f315f] to-[#76511c]",
  andheri: "from-[#10211c] via-[#213b34] to-[#46524d]",
  default: "from-[#0d1a14] to-[#141c26]"
};

export const heroWords = [
  "Home",
  "Office",
  "Shop",
  "Flat",
  "Studio",
  "Warehouse",
  "Showroom",
  "Villa",
  "Clinic",
  "Garage"
];

export const heroSublineMap: Record<string, string> = {
  Home: "Search flats, apartments and houses across India",
  Office: "Find commercial spaces and co-working offices across key business districts",
  Shop: "Browse retail shops and showrooms across active local markets"
};

export function slugifyLocality(locality: string) {
  return locality.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getLocalityGradient(locality?: string | null) {
  const lower = String(locality || "").toLowerCase();
  if (lower.includes("bandra")) return localityGradientMap.bandra;
  if (lower.includes("powai")) return localityGradientMap.powai;
  if (lower.includes("worli")) return localityGradientMap.worli;
  if (lower.includes("andheri")) return localityGradientMap.andheri;
  return localityGradientMap.default;
}

export function formatCurrencyShort(value?: number | null, perMonth = false) {
  if (!value || !Number.isFinite(value)) return "Price on request";
  const suffix = perMonth ? " / month" : "";
  if (value >= 10000000) return `₹${stripZeroes((value / 10000000).toFixed(2))} Cr${suffix}`;
  if (value >= 100000) return `₹${stripZeroes((value / 100000).toFixed(2))} Lakh${suffix}`;
  if (value >= 1000) return `₹${stripZeroes((value / 1000).toFixed(2))} K${suffix}`;
  return `₹${Math.round(value).toLocaleString("en-IN")}${suffix}`;
}

function stripZeroes(value: string) {
  return value.replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function canonicalUrl(pathname: string) {
  return `${siteUrl}${pathname}`;
}
