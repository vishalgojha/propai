import Link from "next/link";
import { HeroSearch } from "@/components/hero-search";
import { ListingCard } from "@/components/listing-card";
import { LocalityCard } from "@/components/locality-card";
import { getHomepageData } from "@/lib/listings";

export const revalidate = 3600;

export default async function HomePage() {
  const data = await getHomepageData();

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <section className="rounded-[32px] border border-[#243040] bg-[#101722]/80 px-6 py-10 shadow-card sm:px-10 sm:py-14">
        <HeroSearch />
      </section>

      <section className="mt-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl text-white">Latest Listings</h2>
            <p className="mt-2 text-sm text-[#9aacc0]">Fresh inventory rendered in the initial HTML for search engines and LLM crawlers.</p>
          </div>
          <Link href="/listings" className="text-sm text-[#25d366]">View all listings →</Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {data.latest.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6">
          <h2 className="font-display text-3xl text-white">Browse by Area</h2>
          <p className="mt-2 text-sm text-[#9aacc0]">Jump directly into locality pages with indexable listing hubs.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
          {data.localityCounts.map((item) => <LocalityCard key={item.slug} locality={item.locality} slug={item.slug} count={item.count} />)}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6">
          <h2 className="font-display text-3xl text-white">Featured Properties</h2>
          <p className="mt-2 text-sm text-[#9aacc0]">Only listings where the broker can be contactable publicly on PropAI Pro.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {data.featured.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
      </section>
    </main>
  );
}
