export const TOP_LOCALITIES = [
  { name: "Bandra West", slug: "bandra-west" },
  { name: "Bandra East", slug: "bandra-east" },
  { name: "Khar West", slug: "khar-west" },
  { name: "Santacruz West", slug: "santacruz-west" },
  { name: "Juhu", slug: "juhu" },
  { name: "Andheri West", slug: "andheri-west" },
  { name: "Andheri East", slug: "andheri-east" },
  { name: "Versova", slug: "versova" },
  { name: "Lokhandwala", slug: "lokhandwala" },
  { name: "Powai", slug: "powai" },
  { name: "Goregaon West", slug: "goregaon-west" },
  { name: "Malad West", slug: "malad-west" },
  { name: "Borivali West", slug: "borivali-west" },
  { name: "Kandivali West", slug: "kandivali-west" },
  { name: "Worli", slug: "worli" },
  { name: "Lower Parel", slug: "lower-parel" },
  { name: "Prabhadevi", slug: "prabhadevi" },
  { name: "Dadar West", slug: "dadar-west" },
  { name: "Matunga", slug: "matunga" },
  { name: "Chembur", slug: "chembur" },
] as const;

export type TopLocality = (typeof TOP_LOCALITIES)[number];

const LOCALITY_RELATIONS: Record<string, string[]> = {
  "bandra-west": ["khar-west", "santacruz-west", "juhu", "bandra-east"],
  "bandra-east": ["bandra-west", "khar-west", "santacruz-west", "andheri-east"],
  "khar-west": ["bandra-west", "santacruz-west", "juhu", "bandra-east"],
  "santacruz-west": ["bandra-west", "khar-west", "juhu", "andheri-west"],
  juhu: ["santacruz-west", "andheri-west", "versova", "bandra-west"],
  "andheri-west": ["lokhandwala", "versova", "juhu", "andheri-east"],
  "andheri-east": ["andheri-west", "powai", "chembur", "bandra-east"],
  versova: ["andheri-west", "lokhandwala", "juhu", "goregaon-west"],
  lokhandwala: ["andheri-west", "versova", "powai", "goregaon-west"],
  powai: ["andheri-east", "lokhandwala", "chembur", "ghatkopar-west"],
  "goregaon-west": ["malad-west", "andheri-west", "lokhandwala", "borivali-west"],
  "malad-west": ["goregaon-west", "borivali-west", "kandivali-west", "andheri-west"],
  "borivali-west": ["malad-west", "kandivali-west", "goregaon-west"],
  "kandivali-west": ["malad-west", "borivali-west", "goregaon-west"],
  worli: ["lower-parel", "prabhadevi", "dadar-west", "bandra-west"],
  "lower-parel": ["worli", "prabhadevi", "dadar-west", "matunga"],
  prabhadevi: ["worli", "lower-parel", "dadar-west", "matunga"],
  "dadar-west": ["matunga", "prabhadevi", "lower-parel", "worli"],
  matunga: ["dadar-west", "chembur", "prabhadevi", "lower-parel"],
  chembur: ["powai", "andheri-east", "matunga", "bandra-east"],
};

export function getLocalityBySlug(slug: string): TopLocality | null {
  return TOP_LOCALITIES.find((locality) => locality.slug === slug) || null;
}

export function slugifyLocalityName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function localityNameFromSlug(slug: string) {
  return (
    getLocalityBySlug(slug)?.name ||
    slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function neighbouringLocalities(slug: string, count = 3): TopLocality[] {
  const relationSlugs = LOCALITY_RELATIONS[slug] || [];
  const related = relationSlugs
    .map((relatedSlug) => getLocalityBySlug(relatedSlug))
    .filter((locality): locality is TopLocality => Boolean(locality))
    .slice(0, count);
  if (related.length >= count) return related;

  const seen = new Set(related.map((locality) => locality.slug));
  const index = TOP_LOCALITIES.findIndex((locality) => locality.slug === slug);
  if (index === -1) {
    return [...related, ...TOP_LOCALITIES.filter((locality) => !seen.has(locality.slug)).slice(0, count - related.length)];
  }

  const neighbours: TopLocality[] = [...related];
  for (let offset = 1; neighbours.length < count && offset < TOP_LOCALITIES.length; offset += 1) {
    const next = TOP_LOCALITIES[(index + offset) % TOP_LOCALITIES.length];
    if (next.slug !== slug && !seen.has(next.slug)) {
      seen.add(next.slug);
      neighbours.push(next);
    }
  }
  return neighbours;
}
