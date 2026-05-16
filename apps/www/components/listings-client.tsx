"use client";

import { useCallback, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { ViewToggle } from "@/components/view-toggle";
import type { PublicListing } from "@/lib/listings";

type ViewMode = "grid" | "list";

export function ListingsClient({ listings }: { listings: PublicListing[] }) {
  const [view, setView] = useState<ViewMode>("grid");

  const handleViewChange = useCallback((next: ViewMode) => {
    setView(next);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <ViewToggle onChange={handleViewChange} />
      </div>
      {view === "list" ? (
        <div className="mt-8 flex flex-col gap-2.5">
          {listings.map((listing) => <ListingCard key={listing.id} listing={listing} view="list" />)}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
      )}
    </>
  );
}
