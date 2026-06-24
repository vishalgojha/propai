"use client";

import { useEffect, useRef, useCallback, memo, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export interface LocalityMapData {
  id: string;
  name: string;
  avgSalePrice: number | null;
  avgRentalRate: number | null;
  activeListings: number;
  rentalYield: number | null;
  inventoryDensity: number | null;
  bhkMix: {
    oneBhk: number;
    twoBhk: number;
    threeBhk: number;
    fourPlus: number;
  };
}

export type DataLayer = "avgSalePrice" | "avgRentalRate" | "activeListings" | "rentalYield" | "inventoryDensity";

interface LocalityDataMapProps {
  localities: LocalityMapData[];
  selectedLayer: DataLayer;
  selectedLocality: string | null;
  onSelectLocality: (id: string | null) => void;
  onHoverLocality: (id: string | null) => void;
  geoJson: GeoJSON.FeatureCollection;
}

const LAYER_LABELS: Record<DataLayer, string> = {
  avgSalePrice: "Avg Sale Price",
  avgRentalRate: "Avg Rental Rate",
  activeListings: "Active Listings",
  rentalYield: "Rental Yield",
  inventoryDensity: "Inventory Density",
};

function getValue(loc: LocalityMapData, layer: DataLayer): number {
  const v = loc[layer];
  if (v === null || v === undefined) return 0;
  return v;
}

function getColor(value: number, max: number, min: number): string {
  if (max === min) return "#1a3a2a";
  const t = (value - min) / (max - min);
  const r = Math.round(20 + t * 215);
  const g = Math.round(58 + t * 130);
  const b = Math.round(42 - t * 42);
  return `rgb(${r},${g},${b})`;
}

function getHoverColor(): string {
  return "#3EE88A";
}

export default memo(function LocalityDataMap({
  localities,
  selectedLayer,
  selectedLocality,
  onSelectLocality,
  onHoverLocality,
  geoJson,
}: LocalityDataMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const hoveredId = useRef<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const getValues = useCallback(() => {
    const values = localities.map((l) => getValue(l, selectedLayer));
    return {
      max: values.length ? Math.max(...values) : 1,
      min: values.length ? Math.min(...values) : 0,
    };
  }, [localities, selectedLayer]);

  const getPaintData = useCallback(() => {
    const { max, min } = getValues();
    const colorMap = new Map<string, string>();
    for (const loc of localities) {
      const v = getValue(loc, selectedLayer);
      colorMap.set(loc.name, getColor(v, max, min));
    }
    return { colorMap, max, min };
  }, [localities, selectedLayer, getValues]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    let mounted = true;

    import("maplibre-gl").then((maplibregl) => {
      if (!mounted || !mapContainer.current) return;

      try {
        const map = new maplibregl.Map({
          container: mapContainer.current,
          style: {
            version: 8,
            name: "PropAI Dark",
            sources: {
              "carto-dark": {
                type: "raster",
                tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"],
                tileSize: 256,
                attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://openstreetmap.org">OSM</a>',
              },
            },
            layers: [
              {
                id: "carto-dark-layer",
                type: "raster",
                source: "carto-dark",
                minzoom: 0,
                maxzoom: 22,
              },
            ],
            glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
          },
          center: [72.877, 19.076],
          zoom: 11,
          minZoom: 10,
          maxZoom: 15,
          attributionControl: false,
        });

        mapRef.current = map;
        setMapLoaded(true);

        map.addControl(new maplibregl.NavigationControl(), "bottom-right");

        map.on("load", () => {
          if (!mounted || !mapRef.current) return;

          const sourceId = "localities";
          map.addSource(sourceId, {
            type: "geojson",
            data: geoJson,
          });

          map.addLayer({
            id: "locality-fill",
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                getHoverColor(),
                ["boolean", ["feature-state", "selected"], false],
                "#2a5a3a",
                "#1a3a2a",
              ],
              "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                0.5,
                ["boolean", ["feature-state", "selected"], false],
                0.45,
                0.35,
              ],
            },
          });

          map.addLayer({
            id: "locality-border",
            type: "line",
            source: sourceId,
            paint: {
              "line-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                "#3EE88A",
                ["boolean", ["feature-state", "selected"], false],
                "#3EE88A",
                "rgba(255,255,255,0.08)",
              ],
              "line-width": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                3,
                ["boolean", ["feature-state", "selected"], false],
                2.5,
                1,
              ],
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,
                ["boolean", ["feature-state", "selected"], false],
                0.8,
                0.4,
              ],
            },
          });

          map.addLayer({
            id: "locality-glow",
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#3EE88A",
              "line-width": 8,
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                0.3,
                0,
              ],
              "line-blur": 4,
            },
          });

          map.on("mousemove", sourceId, (e) => {
            if (!mapRef.current) return;
            const feature = e.features?.[0];
            if (feature?.properties?.id) {
              const id = feature.properties.id;
              if (hoveredId.current !== id) {
                if (hoveredId.current) {
                  map.setFeatureState({ source: sourceId, id: hoveredId.current }, { hover: false });
                }
                hoveredId.current = id;
                map.setFeatureState({ source: sourceId, id }, { hover: true });
                onHoverLocality(id);

                const loc = localities.find((l) => l.id === id);
                if (loc) {
                  if (popupRef.current) popupRef.current.remove();
                  const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
                  const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
                  const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
                  const v = getValue(loc, selectedLayer);
                  const label = LAYER_LABELS[selectedLayer];
                  const formatted = selectedLayer === "avgSalePrice" || selectedLayer === "avgRentalRate"
                    ? `₹${v.toLocaleString()}`
                    : v.toLocaleString();
                  popupRef.current = new maplibregl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    offset: 12,
                    className: "propai-popup",
                  })
                    .setLngLat([cx, cy])
                    .setHTML(`<div class="propai-popup-inner"><span class="propai-popup-name">${loc.name}</span><span class="propai-popup-value">${formatted}</span><span class="propai-popup-label">${label}</span></div>`)
                    .addTo(mapRef.current);
                }
              }
            } else {
              if (hoveredId.current) {
                map.setFeatureState({ source: sourceId, id: hoveredId.current }, { hover: false });
                hoveredId.current = null;
                onHoverLocality(null);
              }
              if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
              }
            }
          });

          map.on("mouseleave", sourceId, () => {
            if (!mapRef.current) return;
            if (hoveredId.current) {
              map.setFeatureState({ source: sourceId, id: hoveredId.current }, { hover: false });
              hoveredId.current = null;
              onHoverLocality(null);
            }
            if (popupRef.current) {
              popupRef.current.remove();
              popupRef.current = null;
            }
          });

          map.on("click", sourceId, (e) => {
            if (!mapRef.current) return;
            const feature = e.features?.[0];
            if (feature?.properties?.id) {
              const id = feature.properties.id;
              onSelectLocality(id);
              const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
              const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
              const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
              mapRef.current.flyTo({
                center: [cx, cy],
                zoom: 13,
                duration: 1200,
              });
            }
          });

          map.on("click", (e) => {
            if (!mapRef.current) return;
            const features = mapRef.current.queryRenderedFeatures(e.point, { layers: ["locality-fill"] });
            if (!features.length) {
              onSelectLocality(null);
            }
          });

          const style = document.createElement("style");
          style.textContent = `
            .maplibregl-map { background: transparent !important; }
            .maplibregl-control-container .maplibregl-ctrl-top-right { top: 12px; right: 12px; }
            .maplibregl-ctrl-group { border-radius: 10px !important; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.5) !important; }
            .maplibregl-ctrl-group button { background: #0a0e16 !important; border-color: rgba(255,255,255,0.06) !important; width: 34px !important; height: 34px !important; display: flex !important; align-items: center !important; justify-content: center !important; }
            .maplibregl-ctrl-group button:hover { background: #141a26 !important; }
            .maplibregl-ctrl-group button span { filter: invert(1) brightness(0.6); }
            .propai-popup .maplibregl-popup-content { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
            .propai-popup .maplibregl-popup-tip { display: none; }
            .propai-popup-inner { background: rgba(7,11,17,0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px; min-width: 140px; }
            .propai-popup-name { display: block; font-size: 12px; font-weight: 700; color: #f8fafc; margin-bottom: 2px; }
            .propai-popup-value { display: block; font-size: 16px; font-weight: 900; color: #3EE88A; }
            .propai-popup-label { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.4); margin-top: 2px; }
          `;
          document.head.appendChild(style);
        });
      } catch (err) {
        console.error('[LocalityDataMap] Failed to initialize map:', err);
        setMapError(err instanceof Error ? err.message : 'Failed to load map');
      }
    }).catch((err) => {
      console.error('[LocalityDataMap] Failed to load maplibre-gl:', err);
      if (mounted) {
        setMapError(err instanceof Error ? err.message : 'Failed to load map library');
      }
    });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [geoJson]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    const source = mapRef.current.getSource("localities") as any;
    if (source) {
      source.setData(geoJson);
    }
  }, [geoJson]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    const sourceId = "localities";
    if (selectedLocality) {
      onSelectLocality(selectedLocality);
    }
  }, [localities, selectedLayer]);

  return (
    <div
      ref={mapContainer}
      className="absolute inset-0"
    >
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
          <div className="max-w-md">
            <div className="text-[var(--accent)] mb-2">⚠</div>
            <p className="text-white/70 text-sm mb-3">Map failed to load</p>
            <p className="text-white/40 text-xs mb-4">{mapError}</p>
            <button
              onClick={() => { setMapError(null); setMapLoaded(false); }}
              className="text-[var(--accent)] underline text-sm hover:no-underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/40 text-sm">Loading map...</div>
        </div>
      )}
    </div>
  );
});
