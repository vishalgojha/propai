import Link from "next/link";
import { getLocalityGradient } from "@/lib/site";

export function LocalityCard({ locality, slug, count }: { locality: string; slug: string; count: number }) {
  return (
    <Link
      href={`/locality/${slug}`}
      className={`placeholder-grid overflow-hidden rounded-[24px] border border-[#243040] bg-gradient-to-br ${getLocalityGradient(locality)} p-5 transition duration-200 hover:-translate-y-1 hover:border-[#3EE88A66]`}
    >
      <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
        Area
      </div>
      <h3 className="mt-10 font-display text-2xl text-white">{locality}</h3>
      <p className="mt-2 text-sm text-white/72">{count.toLocaleString("en-IN")} listings</p>
    </Link>
  );
}
