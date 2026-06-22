'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface MapLocality {
  id: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  avgRent: string;
  demandIndex: number;
  delta: string;
  hot: boolean;
}

interface MumbaiMapProps {
  localities: MapLocality[];
  onHover: (loc: MapLocality | null) => void;
  onSelect: (localityName: string) => void;
}

export default function MumbaiMap({ localities, onHover, onSelect }: MumbaiMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icon path issue in Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '',
        iconUrl: '',
        shadowUrl: '',
      });

      const map = L.map(mapRef.current!, {
        center: [19.076, 72.877],
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      });

      leafletMapRef.current = map;

      // CartoDB Dark Matter — free, no API key needed
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 19,
          subdomains: 'abcd',
        }
      ).addTo(map);

      // Subtle attribution in bottom right
      L.control.attribution({ position: 'bottomright', prefix: '' })
        .addAttribution('<span style="opacity:0.3;font-size:9px">© CartoDB © OpenStreetMap</span>')
        .addTo(map);

      // Add custom CSS for markers
      const style = document.createElement('style');
      style.textContent = `
        .leaflet-container {
          background: #020508;
          font-family: inherit;
        }
        .propai-marker-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
        }
        .propai-marker-inner {
          width: 10px;
          height: 10px;
          background: #101620;
          border: 2px solid #3EE88A;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(62,232,138,0.6);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer;
          z-index: 2;
        }
        .propai-marker-container:hover .propai-marker-inner {
          background: #3EE88A;
          box-shadow: 0 0 16px rgba(62,232,138,0.9), 0 0 32px rgba(62,232,138,0.5);
          transform: scale(1.35);
        }
        .propai-marker-inner.hot {
          background: #3EE88A;
          box-shadow: 0 0 12px rgba(62,232,138,0.7), 0 0 24px rgba(62,232,138,0.3);
        }
        .propai-marker-pulse {
          position: absolute;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(62,232,138,0.22);
          animation: propai-pulse 2.5s ease-out infinite;
          z-index: 1;
        }
        @keyframes propai-pulse {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .propai-label-badge {
          position: absolute;
          bottom: 20px;
          background: rgba(7, 11, 17, 0.88);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 10px;
          font-weight: 700;
          color: rgba(248, 250, 252, 0.85);
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
          letter-spacing: 0.03em;
          font-family: ui-sans-serif, system-ui, sans-serif;
          z-index: 3;
        }
        .propai-marker-container:hover .propai-label-badge {
          color: #3EE88A;
          border-color: rgba(62, 232, 138, 0.4);
          transform: translateY(-2px);
          box-shadow: 0 0 12px rgba(62, 232, 138, 0.25), 0 4px 16px rgba(0, 0, 0, 0.6);
          background: rgba(7, 11, 17, 0.98);
        }
        .leaflet-container .leaflet-bar {
          border: 1px solid rgba(255,255,255,0.12) !important;
          border-radius: 8px !important;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        }
        .leaflet-container .leaflet-bar a {
          background: rgba(7, 11, 17, 0.9) !important;
          backdrop-filter: blur(8px);
          color: rgba(255,255,255,0.7) !important;
          border: none !important;
          border-bottom: 1px solid rgba(255,255,255,0.08) !important;
          width: 30px !important;
          height: 30px !important;
          line-height: 30px !important;
          font-size: 15px !important;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .leaflet-container .leaflet-bar a:last-child {
          border-bottom: none !important;
        }
        .leaflet-container .leaflet-bar a:hover {
          background: rgba(62, 232, 138, 0.15) !important;
          color: #3EE88A !important;
        }
        .leaflet-control-attribution {
          background: transparent !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);

      // Add locality markers
      localities.forEach((loc) => {
        const markerEl = document.createElement('div');
        markerEl.className = 'propai-marker-container';
        markerEl.innerHTML = `
          <div class="propai-label-badge">${loc.name}</div>
          ${loc.hot ? '<div class="propai-marker-pulse"></div>' : ''}
          <div class="propai-marker-inner${loc.hot ? ' hot' : ''}"></div>
        `;

        const icon = L.divIcon({
          html: markerEl,
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([loc.lat, loc.lng], { icon });
        marker.addTo(map);

        // Events
        marker.on('mouseover', () => {
          onHover(loc);
        });

        marker.on('mouseout', () => {
          onHover(null);
        });

        marker.on('click', () => {
          onSelect(loc.name);
        });
      });

      // Automatically adjust map boundaries to show all markers perfectly
      if (localities.length > 0) {
        const bounds = L.latLngBounds(localities.map(loc => [loc.lat, loc.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-[360px] sm:h-[450px] rounded-2xl overflow-hidden"
      style={{ background: '#07111a' }}
    />
  );
}
