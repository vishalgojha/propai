"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import { ImageIcon, LoaderIcon } from "../../lib/icons";
import backendApi from "../../services/api";
import { ENDPOINTS } from "../../services/endpoints";

type Photo = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

type Props = {
  streamItemId: string;
};

export function ListingGallery({ streamItemId }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);

  useEffect(() => {
    if (loaded || loading) return;
    setLoading(true);
    backendApi
      .get(ENDPOINTS.streamItems.photos(streamItemId))
      .then((res) => {
        const items: Photo[] = res.data?.photos || [];
        setPhotos(items);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [streamItemId, loaded, loading]);

  useEffect(() => {
    if (photos.length === 0) return;

    const lightbox = new PhotoSwipeLightbox({
      dataSource: photos.map((p) => ({
        src: p.url,
        alt: p.fileName,
      })),
      pswpModule: () => import("photoswipe"),
    });
    lightbox.init();
    lightboxRef.current = lightbox;

    return () => {
      lightbox.destroy();
      lightboxRef.current = null;
    };
  }, [photos]);

  const openGallery = useCallback(
    (index: number) => {
      lightboxRef.current?.loadAndOpen(index);
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-white/[0.04] bg-[var(--bg-elevated)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
        Loading photos...
      </div>
    );
  }

  if (photos.length === 0) return null;

  const first = photos[0];
  const rest = photos.slice(1, 5);
  const remaining = photos.length - 5;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
        <ImageIcon className="h-3 w-3" />
        Photos ({photos.length})
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => openGallery(0)}
          className="col-span-2 row-span-2 overflow-hidden rounded-[14px] border border-white/[0.04] bg-[var(--bg-elevated)] transition-opacity hover:opacity-90"
        >
          <img
            src={first.url}
            alt={first.fileName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </button>
        {rest.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => openGallery(i + 1)}
            className="relative overflow-hidden rounded-[14px] border border-white/[0.04] bg-[var(--bg-elevated)] transition-opacity hover:opacity-90"
          >
            <img
              src={photo.url}
              alt={photo.fileName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {i === rest.length - 1 && remaining > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">
                +{remaining}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
