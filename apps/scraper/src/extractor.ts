import type { Price, Area } from "./types.js";

const LISTING_TYPES: [RegExp, string][] = [
  [/(for|on)\s+(rent|lease|ll)|available.*(rent|lease)|lease|on\s+ll/i, "Rent/Lease"],
  [/(for\s+)?(sale|outright)|available.*(sale|outright)/i, "Sale"],
  [/(required|requirement|need|wanted|looking|urgently)\s/i, "Requirement"],
];

const BHK_RE = /(\d+(?:\.\d+)?)\s*(bhk)/i;

const PRICE_PATTERNS: RegExp[] = [
  /(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(cr|crore)/i,
  /(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(lac|lakh)/i,
  /(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*k\b/i,
  /(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(?=[\s\n]|$)/i,
];

const AREA_RE = /(\d[\d,]*)\s*(sq\.?\s*ft|sqft|sq\.\s*ft\.|sqt|carpet)/i;
const AREA_NUM_RE = /(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|sqt)/i;

const PARKING_RE = /(\d+)\s*(car\s*)?park(?:ing|\s+)?/i;
const NO_PARKING_RE = /no\s+(parking|car\s+park)/i;

const FURNISHING_PATTERNS: [RegExp, string][] = [
  [/fully\s+furnished/i, "Fully Furnished"],
  [/semi\s+furnished/i, "Semi Furnished"],
  [/unfurnished|bare\s+shell|uf\b/i, "Unfurnished"],
  [/(?:^|\s)ff\b/i, "Fully Furnished"],
  [/(?:^|\s)sf\b/i, "Semi Furnished"],
  [/furnished|furnish/i, "Furnished"],
];

const PHONE_RE = /(?:\+91[-\s]?)?(\d{5}[-\s]?\d{5})/g;

const LOCALITY_MAP: Record<string, string> = {
  "bandra w": "Bandra West",
  "bandra west": "Bandra West",
  bw: "Bandra West",
  "bandra w.": "Bandra West",
  "bandra west.": "Bandra West",
  "bandra ": "Bandra",
  "bandra e": "Bandra East",
  "bandra east": "Bandra East",
  be: "Bandra East",
  "bandra east.": "Bandra East",
  "bandra e.": "Bandra East",
  "bandra reclamation": "Bandra Reclamation",
  bandstand: "Bandstand",
  "pali hill": "Pali Hill",
  "pali village": "Pali Village",
  "pali mala": "Pali Mala",
  "mount mary": "Mount Mary",
  "mount merry": "Mount Mary",
  "carter road": "Carter Road",
  "turner road": "Turner Road",
  "perry road": "Perry Road",
  "perry cross": "Perry Cross",
  "hill road": "Hill Road",
  "linking road bandra": "Linking Road",
  "sv road bandra": "SV Road",
  "waterfield road": "Waterfield Road",
  "water filed road": "Waterfield Road",
  "union park": "Union Park",
  kherwadi: "Kherwadi",
  "kher nagar": "Kher Nagar",
  khernagar: "Kher Nagar",
  "pali naka": "Pali Naka",
  "khar w": "Khar West",
  "khar west": "Khar West",
  kw: "Khar West",
  khar: "Khar",
  "khar e": "Khar East",
  "khar east": "Khar East",
  "khar gymkhana": "Khar Gymkhana",
  "khar bandra": "Khar",
  "scruz w": "Santacruz West",
  "santacruz w": "Santacruz West",
  "santacruz west": "Santacruz West",
  "santa cruz west": "Santacruz West",
  scruz: "Santacruz",
  santacruz: "Santacruz",
  "santacruz e": "Santacruz East",
  "santacruz east": "Santacruz East",
  "santa cruz east": "Santacruz East",
  "scruz e": "Santacruz East",
  juhu: "Juhu",
  "juhu scheme": "Juhu Scheme",
  "juhu tara": "Juhu Tara Road",
  "juhu tara road": "Juhu Tara Road",
  jvpd: "JVPD Scheme",
  "jvpd scheme": "JVPD Scheme",
  "gulmohar road": "Gulmohar Road",
  "ns road": "NS Road",
  "andheri w": "Andheri West",
  "andheri west": "Andheri West",
  aw: "Andheri West",
  "andheri e": "Andheri East",
  "andheri east": "Andheri East",
  ae: "Andheri East",
  lokhandwala: "Lokhandwala",
  "lokhandwala complex": "Lokhandwala Complex",
  versova: "Versova",
  "yari road": "Yari Road",
  oshivara: "Oshiwara",
  oshiwara: "Oshiwara",
  "vile parle w": "Vile Parle West",
  "vile parle west": "Vile Parle West",
  vpw: "Vile Parle West",
  "vile parle e": "Vile Parle East",
  "vile parle east": "Vile Parle East",
  vpe: "Vile Parle East",
  "vile parle": "Vile Parle",
  "malad w": "Malad West",
  "malad west": "Malad West",
  "malad e": "Malad East",
  "malad east": "Malad East",
  "goregaon w": "Goregaon West",
  "goregaon west": "Goregaon West",
  "goregaon e": "Goregaon East",
  "goregaon east": "Goregaon East",
  "dadar w": "Dadar West",
  "dadar west": "Dadar West",
  "dadar e": "Dadar East",
  "dadar east": "Dadar East",
  mahim: "Mahim",
  prabhadevi: "Prabhadevi",
  parel: "Parel",
  worli: "Worli",
  "lower parel": "Lower Parel",
  elphinstone: "Elphinstone",
  matunga: "Matunga",
  "king's circle": "King's Circle",
  vashi: "Vashi",
  nerul: "Nerul",
  belapur: "Belapur",
  kharghar: "Kharghar",
  panvel: "Panvel",
  ghansoli: "Ghansoli",
  rabale: "Rabale",
  thane: "Thane",
  "thane w": "Thane West",
  "thane west": "Thane West",
  bkc: "BKC",
  "bandra kurla complex": "BKC",
  colaba: "Colaba",
  churchgate: "Churchgate",
  "marine lines": "Marine Lines",
  fort: "Fort",
  "nariman point": "Nariman Point",
  tardeo: "Tardeo",
  mahalaxmi: "Mahalaxmi",
  byculla: "Byculla",
};

function contentHash(text: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

export function extractBhk(text: string): string | null {
  const m = BHK_RE.exec(text);
  return m ? `${m[1]} BHK` : null;
}

export function extractTransactionType(text: string): string | null {
  const tl = text.toLowerCase();
  for (const [re, label] of LISTING_TYPES) {
    if (re.test(tl)) return label;
  }
  return null;
}

export function extractPrices(text: string): Price[] {
  const results: Price[] = [];
  for (const pat of PRICE_PATTERNS) {
    for (const m of text.matchAll(pat)) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      const unitRaw = m[2]?.toLowerCase();
      let unit: "Cr" | "Lac" | "K";
      if (unitRaw && /cr/.test(unitRaw)) unit = "Cr";
      else if (unitRaw && /lac/.test(unitRaw)) unit = "Lac";
      else if (unitRaw === "k") unit = "K";
      else continue;
      results.push({ value: val, unit });
    }
  }
  return results;
}

export function normalizePrice(val: number, unit: string): number {
  if (unit === "Cr") return val * 100;
  if (unit === "K") return val / 100;
  return val;
}

export function extractArea(text: string): Area | null {
  let m = AREA_NUM_RE.exec(text);
  if (m) return { value: parseInt(m[1].replace(/,/g, "")), unit: "sqft" };
  m = /(\d[\d,]*)\s*(?:carpet)/i.exec(text);
  if (m) return { value: parseInt(m[1].replace(/,/g, "")), unit: "sqft" };
  return null;
}

export function extractParking(text: string): number {
  if (NO_PARKING_RE.test(text)) return 0;
  const parks = [...text.matchAll(PARKING_RE)];
  if (parks.length) return Math.max(...parks.map((p) => parseInt(p[1])));
  if (/\bparking\b/i.test(text) || /\bcar park\b/i.test(text)) return 1;
  return 0;
}

export function extractFurnishing(text: string): string | null {
  for (const [re, label] of FURNISHING_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

export function extractPhones(text: string): string[] {
  const phones = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const cleaned = m[0].replace(/[^\d]/g, "");
    if (cleaned.length === 10) phones.add(cleaned);
    else if (cleaned.length === 12 && cleaned.startsWith("91")) phones.add(cleaned.slice(-10));
  }
  return [...phones].sort();
}

export function extractLocalities(text: string): string[] {
  const tl = text.toLowerCase();
  const found = new Set<string>();

  for (const [raw, canonical] of Object.entries(LOCALITY_MAP)) {
    if (tl.includes(raw)) found.add(canonical);
  }

  if (!found.size) {
    const major: [string, string][] = [
      ["bandra", "Bandra"], ["khar", "Khar"], ["santacruz", "Santacruz"],
      ["juhu", "Juhu"], ["andheri", "Andheri"], ["dadar", "Dadar"],
      ["vile parle", "Vile Parle"], ["malad", "Malad"], ["goregaon", "Goregaon"],
      ["mahim", "Mahim"], ["prabhadevi", "Prabhadevi"], ["parel", "Parel"],
      ["worli", "Worli"], ["vashi", "Vashi"], ["thane", "Thane"],
      ["oshiwara", "Oshiwara"], ["versova", "Versova"],
      ["bkc", "BKC"], ["colaba", "Colaba"],
    ];
    for (const [raw, canonical] of major) {
      if (tl.includes(raw)) found.add(canonical);
    }
  }

  return [...found].sort();
}

export function extractFirstPhone(text: string): string | null {
  const phones = extractPhones(text);
  return phones.length > 0 ? phones[0] : null;
}

export function extractAll(text: string) {
  const prices = extractPrices(text);
  const price = prices.length > 0 ? prices[0] : null;
  const localities = extractLocalities(text);
  const phones = extractPhones(text);

  return {
    bhk: extractBhk(text),
    transaction_type: extractTransactionType(text),
    locality: localities.length > 0 ? localities[0] : null,
    localities,
    furnishing: extractFurnishing(text),
    parking: extractParking(text),
    area_sqft: extractArea(text)?.value ?? null,
    price_value: price?.value ?? null,
    price_unit: price?.unit ?? null,
    price_lakhs: price ? normalizePrice(price.value, price.unit) : null,
    prices,
    phones,
    phone: phones.length > 0 ? phones[0] : null,
    content_preview: text.slice(0, 200),
  };
}
