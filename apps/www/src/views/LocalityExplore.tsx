"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Layers,
  TrendingUp,
  TrendingDown,
  Building2,
  Users,
  MapPin,
  X,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import LocalityDataMap, { type LocalityMapData, type DataLayer } from "@/components/LocalityDataMap";
import { LOCALITY_POLYGONS } from "@/data/localityPolygons";

interface LocalityExploreProps {
  initialData: LocalityMapData[];
}

const DATA_LAYERS: { key: DataLayer; label: string; unit: string; icon: typeof TrendingUp }[] = [
  { key: "avgSalePrice", label: "Average Sale Price", unit: "₹ / sqft", icon: TrendingUp },
  { key: "avgRentalRate", label: "Average Rental Rate", unit: "₹ / month", icon: TrendingDown },
  { key: "activeListings", label: "Active Listings", unit: "listings", icon: Building2 },
  { key: "rentalYield", label: "Rental Yield", unit: "%", icon: TrendingUp },
  { key: "inventoryDensity", label: "Inventory Density", unit: "% supply", icon: Layers },
];

function formatValue(value: number | null, layer: DataLayer): string {
  if (value === null || value === undefined) return "—";
  if (layer === "avgSalePrice") return `₹${value.toLocaleString()}`;
  if (layer === "avgRentalRate") return `₹${value.toLocaleString()}`;
  if (layer === "rentalYield") return `${value}%`;
  if (layer === "inventoryDensity") return `${value}%`;
  return value.toLocaleString();
}

export default function LocalityExplore({ initialData }: LocalityExploreProps) {
  const [selectedLayer, setSelectedLayer] = useState<DataLayer>("avgSalePrice");
  const [selectedLocality, setSelectedLocality] = useState<string | null>(null);
  const [hoveredLocality, setHoveredLocality] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const selectedData = useMemo(() => {
    return initialData.find((l) => l.id === selectedLocality) || null;
  }, [initialData, selectedLocality]);

  const hoveredData = useMemo(() => {
    return initialData.find((l) => l.id === hoveredLocality) || null;
  }, [initialData, hoveredLocality]);

  const rankedLocalities = useMemo(() => {
    return [...initialData]
      .sort((a, b) => {
        const va = a[selectedLayer] ?? 0;
        const vb = b[selectedLayer] ?? 0;
        return vb - va;
      })
      .slice(0, 10);
  }, [initialData, selectedLayer]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return initialData.filter((l) => l.name.toLowerCase().includes(q));
  }, [initialData, searchQuery]);

  const handleSelectLocality = useCallback((id: string | null) => {
    setSelectedLocality(id);
    setShowSearchResults(false);
  }, []);

  const activeLocalityData = hoveredData || selectedData;
  const panelData = activeLocalityData || rankedLocalities[0];
  const panelMode = activeLocalityData ? "detail" : "rankings";

  const colorBar = useMemo(() => {
    const values = initialData.map((l) => l[selectedLayer] ?? 0).filter((v) => v > 0);
    if (values.length < 2) return null;
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min) return null;
    return { max, min };
  }, [initialData, selectedLayer]);

  return (
    <div className="h-screen w-full bg-[#020408] overflow-hidden relative flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <Link
            href="/"
            className="text-[13px] font-black tracking-[-0.02em] text-white/80 hover:text-[var(--accent)] transition-colors"
          >
            PropAI
            <span className="text-[var(--accent)]"> Pulse</span>
          </Link>
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/30">
            <MapPin className="h-3 w-3" />
            Mumbai
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Search */}
          <div className="relative">
            <div className="flex items-center rounded-xl border border-white/5 bg-black/60 backdrop-blur-md px-3 py-2 w-[200px] sm:w-[260px]">
              <Search className="h-3.5 w-3.5 text-white/30 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search locality..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                className="w-full bg-transparent text-[12px] text-white/70 placeholder:text-white/20 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setShowSearchResults(false); }}
                  className="ml-1"
                >
                  <X className="h-3 w-3 text-white/30 hover:text-white/60" />
                </button>
              )}
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 rounded-xl border border-white/5 bg-[#0a0e16]/95 backdrop-blur-md overflow-hidden shadow-xl">
                {searchResults.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => {
                      handleSelectLocality(loc.id);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[12px] text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <MapPin className="h-3 w-3 text-[var(--accent)] shrink-0" />
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
            {showSearchResults && searchQuery && searchResults.length === 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 rounded-xl border border-white/5 bg-[#0a0e16]/95 backdrop-blur-md p-3 text-center text-[11px] text-white/30">
                No localities found
              </div>
            )}
          </div>

          {/* Layer selector */}
          <div className="relative">
            <button
              onClick={() => setShowLayerMenu(!showLayerMenu)}
              className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/60 backdrop-blur-md px-3 py-2 text-[11px] font-bold text-white/60 hover:text-white/80 hover:border-white/10 transition-all"
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{DATA_LAYERS.find((l) => l.key === selectedLayer)?.label}</span>
            </button>
            {showLayerMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowLayerMenu(false)} />
                <div className="absolute top-full right-0 mt-1 z-20 w-56 rounded-xl border border-white/5 bg-[#0a0e16]/95 backdrop-blur-md overflow-hidden shadow-xl">
                  {DATA_LAYERS.map((layer) => (
                    <button
                      key={layer.key}
                      onClick={() => {
                        setSelectedLayer(layer.key);
                        setShowLayerMenu(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left text-[12px] transition-colors",
                        selectedLayer === layer.key
                          ? "text-[var(--accent)] bg-white/5"
                          : "text-white/50 hover:text-white hover:bg-white/5",
                      )}
                    >
                      <layer.icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{layer.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Map container */}
      <div className="flex-1 relative">
        <LocalityDataMap
          localities={initialData}
          selectedLayer={selectedLayer}
          selectedLocality={selectedLocality}
          onSelectLocality={handleSelectLocality}
          onHoverLocality={setHoveredLocality}
          geoJson={LOCALITY_POLYGONS}
        />
      </div>

      {/* Right side panel */}
      <div className="absolute top-16 right-4 bottom-4 z-10 w-[300px] pointer-events-none">
        <div className="h-full pointer-events-auto rounded-2xl border border-white/5 bg-[#070b11]/90 backdrop-blur-xl overflow-y-auto scrollbar-thin">
          {/* Panel header */}
          <div className="p-4 border-b border-white/5">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1">
              {panelMode === "detail" ? "Selected Locality" : "Top Localities"}
            </div>
            <h2 className="text-[18px] font-black text-white">
              {panelMode === "detail" ? activeLocalityData?.name : "Locality Data"}
            </h2>
            {panelMode === "detail" && activeLocalityData && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-[0.1em]">
                  {DATA_LAYERS.find((l) => l.key === selectedLayer)?.label}
                </span>
                <span className="text-[14px] font-black text-[var(--accent)]">
                  {formatValue(activeLocalityData[selectedLayer], selectedLayer)}
                </span>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {panelMode === "detail" && activeLocalityData && (
            <div className="p-4 space-y-4">
              {/* Core metrics */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30 mb-1">Sale Price</div>
                  <div className="text-[15px] font-black text-white">{formatValue(activeLocalityData.avgSalePrice, "avgSalePrice")}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30 mb-1">Rent</div>
                  <div className="text-[15px] font-black text-white">{formatValue(activeLocalityData.avgRentalRate, "avgRentalRate")}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30 mb-1">Listings</div>
                  <div className="text-[15px] font-black text-white">{activeLocalityData.activeListings}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30 mb-1">Yield</div>
                  <div className="text-[15px] font-black text-white">{formatValue(activeLocalityData.rentalYield, "rentalYield")}</div>
                </div>
              </div>

              {/* BHK Mix */}
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30 mb-2">Inventory Mix</div>
                <div className="space-y-1.5">
                  {[
                    { label: "1 BHK", value: activeLocalityData.bhkMix.oneBhk },
                    { label: "2 BHK", value: activeLocalityData.bhkMix.twoBhk },
                    { label: "3 BHK", value: activeLocalityData.bhkMix.threeBhk },
                    { label: "4 BHK+", value: activeLocalityData.bhkMix.fourPlus },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="text-[11px] text-white/40 w-12">{item.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                          style={{ width: `${item.value}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-white/60 w-8 text-right">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rankings */}
          <div className="p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-3">
              Rankings — {DATA_LAYERS.find((l) => l.key === selectedLayer)?.label}
            </div>
            <div className="space-y-1">
              {rankedLocalities.map((loc, i) => (
                <button
                  key={loc.id}
                  onClick={() => handleSelectLocality(loc.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors",
                    selectedLocality === loc.id
                      ? "bg-[var(--accent)]/10 border border-[var(--accent)]/20"
                      : "hover:bg-white/[0.03] border border-transparent",
                  )}
                >
                  <span className={cn(
                    "text-[11px] font-black w-5 text-center",
                    i === 0 ? "text-[var(--accent)]" : "text-white/30",
                  )}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-white/80 truncate">{loc.name}</div>
                    <div className="text-[10px] text-white/30">{formatValue(loc[selectedLayer], selectedLayer)}</div>
                  </div>
                  <ArrowUpDown className="h-3 w-3 text-white/20 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Color scale */}
          {colorBar && (
            <div className="px-4 pb-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-2">Scale</div>
              <div className="h-2 rounded-full bg-gradient-to-r from-[#143a2a] via-[#5a8a3a] to-[#ea5a20]" />
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-white/30">{formatValue(colorBar.min, selectedLayer)}</span>
                <span className="text-[9px] text-white/30">{formatValue(colorBar.max, selectedLayer)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attribution */}
      <div className="absolute bottom-3 left-4 z-10 text-[9px] text-white/20">
        <span>Data from broker network · Updated every 30 min</span>
      </div>
    </div>
  );
}
