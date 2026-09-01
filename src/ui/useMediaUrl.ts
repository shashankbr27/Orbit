'use client';

import { useEffect, useState } from 'react';
import { mediaCache } from '@/engine/objects/mediaCache';

/** Object URL for a stored asset, for use in HTML surfaces. */
export function useMediaUrl(mediaId: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    mediaId ? mediaCache().peekUrl(mediaId) : null,
  );

  useEffect(() => {
    if (!mediaId) {
      setUrl(null);
      return;
    }
    const cached = mediaCache().peekUrl(mediaId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    void mediaCache()
      .url(mediaId)
      .then((u) => {
        if (alive) setUrl(u);
      });
    return () => {
      alive = false;
    };
  }, [mediaId]);

  return url;
}
