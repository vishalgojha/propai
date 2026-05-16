"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const chips = ["2BHK Bandra", "Rental Powai", "1Cr Worli", "3BHK Juhu", "Furnished Andheri"];

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  async function submitSearch(nextQuery: string) {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: nextQuery })
    });
    const payload = await response.json();
    if (payload?.redirectTo) {
      router.push(payload.redirectTo);
    }
  }

  return (
    <div className="mx-auto mt-5 max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) void submitSearch(query.trim());
        }}
        className="overflow-hidden rounded-[20px] border border-[#2b3a4e] bg-[#101722]/90 shadow-card"
      >
        <div className="flex">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='e.g. "2BHK in Bandra under ₹80k"'
            className="h-12 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-[#7d8da3]"
          />
          <button
            type="submit"
            className="h-12 bg-[#3EE88A] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Search
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => void submitSearch(chip)}
            className="rounded-full border border-[#2b3a4e] bg-[#0d1117] px-3 py-1 text-xs text-[#94a3b8] transition hover:border-[#3EE88A66] hover:text-white"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
