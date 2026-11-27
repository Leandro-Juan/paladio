'use client';

import React, { useEffect, useRef } from 'react';
import { dataImageToObjectUrl, sanitizeHttpImageUrl, sanitizeImageUrl } from '@/utils/api';

interface SanitizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
}

export function SanitizedImage({ src, alt = '', ...props }: SanitizedImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const isRenderable = Boolean(sanitizeImageUrl(src));

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !src) {
      if (el) el.removeAttribute('src');
      return;
    }

    const blobUrl = dataImageToObjectUrl(src);
    if (blobUrl) {
      el.src = blobUrl;
      return () => {
        URL.revokeObjectURL(blobUrl);
      };
    }

    const safeHttpUrl = sanitizeHttpImageUrl(src);
    if (safeHttpUrl) {
      el.src = safeHttpUrl;
    } else {
      el.removeAttribute('src');
    }
    return undefined;
  }, [src]);

  if (!isRenderable) {
    return null;
  }

  return <img ref={imgRef} alt={alt} {...props} />;
}
