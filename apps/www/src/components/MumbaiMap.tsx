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
          background: #07111a;
          font-family: inherit;
        }
        .propai-marker {
          position: relative;
        }
        .propai-marker-inner {
          width: 14px;
          height: 14px;
          background: #101620;
          border: 2.5px solid #3EE88A;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(62,232,138,0.5), 0 0 20px rgba(62,232,138,0.2);
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .propai-marker-inner:hover,
        .propai-marker-inner.hot {
          background: #3EE88A;
          box-shadow: 0 0 16px rgba(62,232,138,0.8), 0 0 32px rgba(62,232,138,0.4);
          transform: scale(1.3);
        }
        .propai-marker-pulse {
          position: absolute;
          top: -5px;
          left: -5px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(62,232,138,0.2);
          animation: propai-pulse 2.5s ease-out infinite;
        }
        @keyframes propai-pulse {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .propai-label {
          background: transparent;
          border: none;
          box-shadow: none;
        }
        .propai-label-text {
          font-size: 10px;
          font-weight: 800;
          color: rgba(255,255,255,0.75);
          white-space: nowrap;
          text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.9);
          pointer-events: none;
          letter-spacing: 0.03em;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(255,255,255,0.07) !important;
          border-radius: 10px !important;
          overflow: hidden;
          box-shadow: none !important;
        }
        .leaflet-control-zoom a {
          background: rgba(7, 11, 17, 0.9) !important;
          color: rgba(255,255,255,0.6) !important;
          border-bottom: 1px solid rgba(255,255,255,0.07) !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(62, 232, 138, 0.1) !important;
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
        markerEl.className = 'propai-marker';
        markerEl.innerHTML = `
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

        // Label
        const labelIcon = L.divIcon({
          html: `<div class="propai-label-text">${loc.name}</div>`,
          className: 'propai-label',
          iconSize: [120, 20],
          iconAnchor: [60, 22],
        });
        L.marker([loc.lat, loc.lng], { icon: labelIcon, interactive: false }).addTo(map);

        // Events
        marker.on('mouseover', () => {
          const inner = markerEl.querySelector('.propai-marker-inner');
          if (inner) {
            (inner as HTMLElement).style.background = '#3EE88A';
            (inner as HTMLElement).style.transform = 'scale(1.4)';
            (inner as HTMLElement).style.boxShadow = '0 0 16px rgba(62,232,138,0.9), 0 0 32px rgba(62,232,138,0.5)';
          }
          onHover(loc);
        });

        marker.on('mouseout', () => {
          const inner = markerEl.querySelector('.propai-marker-inner');
          if (inner) {
            (inner as HTMLElement).style.background = loc.hot ? '#3EE88A' : '#101620';
            (inner as HTMLElement).style.transform = 'scale(1)';
            (inner as HTMLElement).style.boxShadow = loc.hot
              ? '0 0 16px rgba(62,232,138,0.8), 0 0 32px rgba(62,232,138,0.4)'
              : '0 0 10px rgba(62,232,138,0.5), 0 0 20px rgba(62,232,138,0.2)';
          }
          onHover(null);
        });

        marker.on('click', () => {
          onSelect(loc.name);
        });
      });
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
