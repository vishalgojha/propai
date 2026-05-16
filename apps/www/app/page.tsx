import Link from "next/link";
import { HeroSearch } from "@/components/hero-search";
import { ListingCard } from "@/components/listing-card";
import { getHomepageData } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getHomepageData();

  return (
    <main>
      <section className="mx-auto max-w-2xl px-5 pt-14 pb-8 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#3EE88A] bg-[rgba(62, 232, 138, 0.12)] px-3.5 py-1.5 text-xs text-[#0D1A12]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#2DC96E]" />
          Live from broker WhatsApp groups
        </div>
        <h1 className="text-[30px] font-medium leading-tight text-white">
          The freshest Mumbai listings.<br />
          <em className="not-italic text-[#2DC96E]">Straight from broker networks.</em>
        </h1>
        <p className="mx-auto mt-3.5 max-w-lg text-sm leading-relaxed text-[#94a3b8]">
          While other portals wait for brokers to manually upload, we pull directly from 90+ active WhatsApp groups. You see listings minutes after they&apos;re posted — not days later.
        </p>
        <HeroSearch />
      </section>

      <div className="mx-auto grid max-w-lg grid-cols-3 gap-3 px-5 mb-8">
        <div className="rounded-xl bg-[#111820] p-3.5 text-center">
          <div className="text-lg font-medium text-white">{data.stats.listings.toLocaleString("en-IN")}+</div>
          <div className="mt-0.5 text-xs text-[#94a3b8]">Live listings</div>
        </div>
        <div className="rounded-xl bg-[#111820] p-3.5 text-center">
          <div className="text-lg font-medium text-white">{data.stats.brokers.toLocaleString("en-IN")}</div>
          <div className="mt-0.5 text-xs text-[#94a3b8]">Active brokers</div>
        </div>
        <div className="rounded-xl bg-[#111820] p-3.5 text-center">
          <div className="text-lg font-medium text-white">&lt;1 hr</div>
          <div className="mt-0.5 text-xs text-[#94a3b8]">Avg listing age</div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Fresh inventory</div>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-medium text-white">Just posted in broker groups</h2>
            <p className="mt-1.5 text-sm text-[#94a3b8]">These came in from WhatsApp in the last few hours. The broker who posted is real, verified, and reachable.</p>
          </div>
          <Link href="/listings" className="shrink-0 text-sm text-[#2DC96E] hover:underline">
            Browse all &rarr;
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {data.latest.slice(0, 3).map((listing) => (
            <ListingCard key={listing.id} listing={listing} view="list" />
          ))}
          <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-[#243040] bg-[#111820] py-4 text-sm text-[#94a3b8]">
            Showing {Math.min(3, data.stats.listings)} of {data.stats.listings.toLocaleString("en-IN")}+ live listings
            <Link href="/listings" className="font-medium text-[#2DC96E] hover:underline">
              Browse all &rarr;
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">Why PropAI</div>
        <h2 className="text-xl font-medium text-white">Other portals are a day late. We&apos;re not.</h2>
        <p className="mt-1.5 text-sm text-[#94a3b8]">The best listings in Mumbai go in hours, sometimes minutes. Here&apos;s why PropAI gives you the edge.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: "⏱️", bg: "bg-[rgba(62, 232, 138, 0.12)]", title: "Minutes, not days", desc: "Listings appear here within minutes of a broker posting on WhatsApp. 99acres gets it days later &mdash; if at all." },
            { icon: "✓", bg: "bg-[#FAEEDA]", title: "Real brokers, real listings", desc: "Every listing ties to a verified broker in our network. No ghost listings, no duplicate reposts." },
            { icon: "👥", bg: "bg-[#E6F1FB]", title: "Broker-friendly", desc: "We work with brokers, not around them. They get tools, you get fresh inventory &mdash; everyone wins." },
            { icon: "📍", bg: "bg-[#EEEDFE]", title: "Deep MMR coverage", desc: "48 localities across Mumbai and MMR &mdash; from Bandra West to Thane, BKC to Chembur." },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl border border-[#243040] bg-[#121a24]/80 p-4">
              <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${item.bg} text-sm text-[#0D1A12]`}>
                {item.icon}
              </div>
              <h3 className="text-sm font-medium text-white">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl border-t border-[#243040]" />

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">How it works</div>
        <h2 className="text-xl font-medium text-white">Find your next property in three steps</h2>

        <div className="mt-5 space-y-0">
          {[
            { num: "1", title: "Search in plain language", desc: 'Type what you want — "3BHK Andheri West under 2Cr furnished" — our AI understands and returns matching live listings instantly.' },
            { num: "2", title: "See who posted it and when", desc: "Each listing shows the broker's WhatsApp group, time posted, and contact. No mystery middlemen — you know exactly where it came from." },
            { num: "3", title: "Connect directly with the broker", desc: "One tap to WhatsApp or call the broker who has the actual keys. No lead forms, no callback queues." },
          ].map((step, i) => (
            <div key={i} className="flex gap-4 border-b border-[#243040] py-4 last:border-b-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2DC96E] text-xs font-medium text-white">
                {step.num}
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex items-center gap-5 rounded-2xl border border-[#243040] bg-[#121a24]/80 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(62, 232, 138, 0.12)] text-xl text-[#2DC96E]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Are you a broker?</h3>
            <p className="mt-0.5 text-xs text-[#94a3b8]">Join {data.stats.brokers} brokers already on PropAI. Your WhatsApp listings get found by serious buyers and renters — automatically.</p>
            <Link href="/broker/signup" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2DC96E] hover:underline">
              Join as a broker &rarr;
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#243040] px-5 py-10 text-center">
        <h2 className="text-xl font-medium text-white">See what just got listed</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#94a3b8]">Fresh inventory from Mumbai&apos;s broker networks, updated every few minutes.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/listings"
            className="rounded-xl bg-[#2DC96E] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
          >
            Browse live listings
          </Link>
          <Link
            href="/listings"
            className="rounded-xl border border-[#243040] bg-[#121a24] px-5 py-2.5 text-sm text-[#94a3b8] hover:text-white"
          >
            Search my requirement
          </Link>
        </div>
      </section>
    </main>
  );
}
