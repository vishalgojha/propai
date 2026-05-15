"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { heroSublineMap, heroWords } from "@/lib/site";

const chips = ["2BHK Bandra", "Rental Powai", "1Cr Worli", "3BHK Juhu", "Furnished Andheri"];

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const activeWord = heroWords[index];
  const subline = useMemo(() => heroSublineMap[activeWord] || "Search verified listings from real broker networks across India", [activeWord]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % heroWords.length);
    }, 2500);

    return () => window.clearInterval(timer);
  }, []);

  async function submitSearch(nextQuery: string) {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: nextQuery })
    });
    const payload = await response.json();
    if (payload?.redirectTo) {
      router.push(payload.redirectTo);
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="max-w-4xl font-display text-4xl leading-tight text-white sm:text-5xl xl:text-[56px]">
        Find Your
        <br />
        Next <span className="hero-word text-[#25d366]"><span key={activeWord} className="hero-word-inner">{activeWord}</span></span>
      </h1>
      <p key={subline} className="hero-subline mt-5 max-w-2xl text-lg text-[#b7c3d4]">
        {subline}
      </p>

      <div className="mt-8 flex flex-wrap gap-4 text-sm text-[#d5dfeb]">
        <span className="stat-pulse">4,800+ Listings</span>
        <span className="stat-pulse">312 Brokers</span>
        <span className="stat-pulse">48 Localities</span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) void submitSearch(query.trim());
        }}
        className="mt-10 rounded-[26px] border border-[#2b3a4e] bg-[#101722]/90 p-3 shadow-card"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. 2BHK in Bandra under ₹80k, furnished"
            className="h-16 flex-1 rounded-[20px] border border-transparent bg-[#0d1117] px-5 text-base text-white outline-none placeholder:text-[#7d8da3] focus:border-[#25d36666]"
          />
          <button
            type="submit"
            className="h-16 rounded-[20px] bg-[#25d366] px-6 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Search
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setQuery(chip);
                void submitSearch(chip);
              }}
              className="rounded-full border border-[#2b3a4e] bg-[#0d1117] px-3 py-1.5 text-sm text-[#b7c3d4] transition hover:border-[#25d36666] hover:text-white"
            >
              {chip}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
