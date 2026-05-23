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
  const index = TOP_LOCALITIES.findIndex((locality) => locality.slug === slug);
  if (index === -1) return TOP_LOCALITIES.slice(0, count);

  const neighbours: TopLocality[] = [];
  for (let offset = 1; neighbours.length < count && offset < TOP_LOCALITIES.length; offset += 1) {
    const next = TOP_LOCALITIES[(index + offset) % TOP_LOCALITIES.length];
    if (next.slug !== slug) neighbours.push(next);
  }
  return neighbours;
}
