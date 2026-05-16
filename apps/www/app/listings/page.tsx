import type { Metadata } from "next";
import Link from "next/link";
import { ListingsClient } from "@/components/listings-client";
import { canonicalUrl, slugifyLocality } from "@/lib/site";
import { getListingsPageData } from "@/lib/listings";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const filters = parseSearchParams(searchParams);
  const locality = filters.locality;
  const type = filters.type;
  const normalizedType = type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : "Rent & Sale";
  const title = locality
    ? `${normalizedType === "Rent" ? "Flats for Rent" : `Properties for ${normalizedType}`} in ${locality}, India | PropAI`
    : "Properties for Rent & Sale | PropAI Listings";
  const seo = getSeoState(filters);
  return {
    title,
    description: locality ? `Browse verified listings in ${locality} sourced from active broker networks on PropAI.` : "Search verified rent and sale listings sourced from active broker networks on PropAI.",
    alternates: {
      canonical: canonicalUrl(seo.canonicalPath)
    },
    robots: seo.robots,
    openGraph: {
      title,
      description: locality ? `Browse verified listings in ${locality} sourced from active broker networks on PropAI.` : "Search verified rent and sale listings sourced from active broker networks on PropAI.",
      url: canonicalUrl(seo.canonicalPath),
      type: "website"
    }
  };
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const filters = parseSearchParams(searchParams);
  const data = await getListingsPageData(filters);

  const currentPage = data.page;
  const activeLocality = filters.locality;
  const baseParams = toQueryString(filters, false);
  const seo = getSeoState({ ...filters, page: currentPage });

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      {currentPage > 1 ? <link rel="prev" href={canonicalUrl(buildListingsPath(filters, currentPage - 1))} /> : null}
      {currentPage < data.totalPages ? <link rel="next" href={canonicalUrl(buildListingsPath(filters, currentPage + 1))} /> : null}

      <div className="rounded-[28px] border border-[#243040] bg-[#101722]/80 p-6 shadow-card">
        <form method="GET" action="/listings" className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <input name="q" defaultValue={filters.q} placeholder="Search..." className="h-12 rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white" />
          <select name="locality" defaultValue={activeLocality} className="h-12 rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white">
            <option value="">All localities</option>
            {data.localities.map((locality) => <option key={locality} value={locality}>{locality}</option>)}
          </select>
          <select name="type" defaultValue={filters.type} className="h-12 rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white">
            <option value="">All types</option>
            <option value="rent">Rent</option>
            <option value="sale">Sale</option>
            <option value="requirement">Requirement</option>
          </select>
          <input name="bhk" defaultValue={filters.bhk} placeholder="BHK" className="h-12 rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white" />
          <select name="sort" defaultValue={filters.sort} className="h-12 rounded-2xl border border-[#243040] bg-[#0d1117] px-4 text-white">
            <option value="newest">Newest</option>
            <option value="price_asc">Price ↑</option>
            <option value="price_desc">Price ↓</option>
            <option value="match">Match</option>
          </select>
          <button type="submit" className="h-12 rounded-2xl bg-[#3EE88A] px-4 font-semibold text-black">Search</button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {["q", "locality", "type", "bhk"].map((key) => {
            const value = filters[key as keyof ListingsFilters];
            if (!value) return null;
            const next = new URLSearchParams(baseParams.toString());
            next.delete(key);
            return (
              <Link key={key} href={`/listings${next.toString() ? `?${next.toString()}` : ""}`} className="rounded-full border border-[#3EE88A66] bg-[#0f2a1e] px-3 py-1 text-sm text-[#9ef0ba]">
                {value} ×
              </Link>
            );
          })}
        </div>
      </div>

      {!seo.indexable ? (
        <p className="mt-4 text-sm text-[#8ea2ba]">
          Filtered result pages stay crawlable for discovery, but only clean archives are indexable.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-white">Listings</h1>
          <p className="mt-2 text-sm text-[#9aacc0]">
            {data.totalAll.toLocaleString("en-IN")} listings in the network
            {activeLocality ? ` · ${data.total.toLocaleString("en-IN")} listings in ${activeLocality}` : ""}
          </p>
        </div>
      </div>

      <ListingsClient listings={data.results} />

      <div className="mt-10 flex items-center justify-between text-sm text-[#b7c3d4]">
        <div>Page {data.page} of {data.totalPages}</div>
        <div className="flex gap-3">
          {currentPage > 1 ? (
            <Link href={buildListingsPath(filters, currentPage - 1)} className="rounded-full border border-[#243040] px-4 py-2">← Prev</Link>
          ) : null}
          {currentPage < data.totalPages ? (
            <Link href={buildListingsPath(filters, currentPage + 1)} className="rounded-full border border-[#243040] px-4 py-2">Next →</Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}

type ListingsFilters = {
  q: string;
  locality: string;
  type: string;
  bhk: string;
  sort: string;
  page: number;
};

function parseSearchParams(searchParams: PageProps["searchParams"]): ListingsFilters {
  return {
    q: typeof searchParams.q === "string" ? searchParams.q : "",
    locality: typeof searchParams.locality === "string" ? searchParams.locality : "",
    type: typeof searchParams.type === "string" ? searchParams.type : "",
    bhk: typeof searchParams.bhk === "string" ? searchParams.bhk : "",
    sort: typeof searchParams.sort === "string" && searchParams.sort ? searchParams.sort : "newest",
    page: typeof searchParams.page === "string" ? Math.max(1, Number(searchParams.page) || 1) : 1
  };
}

function getSeoState(filters: ListingsFilters) {
  const hasLocality = Boolean(filters.locality);
  const hasType = Boolean(filters.type);
  const hasExtraFilters = Boolean(filters.q || filters.bhk || (filters.sort && filters.sort !== "newest"));
  const canonicalPath = hasLocality && !hasType && !hasExtraFilters
    ? buildLocalityPath(filters.locality, filters.page)
    : buildListingsPath(filters, filters.page);
  const indexable = !hasLocality && !hasExtraFilters;

  return {
    canonicalPath,
    indexable,
    robots: indexable ? undefined : { index: false, follow: true }
  };
}

function buildListingsPath(filters: ListingsFilters, page: number) {
  const query = toQueryString({ ...filters, page }, true);
  return `/listings${query.toString() ? `?${query.toString()}` : ""}`;
}

function buildLocalityPath(locality: string, page: number) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/locality/${slugifyLocality(locality)}${query ? `?${query}` : ""}`;
}

function toQueryString(filters: ListingsFilters, includePage: boolean) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.locality) params.set("locality", filters.locality);
  if (filters.type) params.set("type", filters.type);
  if (filters.bhk) params.set("bhk", filters.bhk);
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (includePage && filters.page > 1) params.set("page", String(filters.page));
  return params;
}
