'use client';

import React, { useEffect, useRef } from 'react';
import { sanitizeImageUrl } from '@/utils/api';

interface SanitizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
}

export function SanitizedImage({ src, alt = '', ...props }: SanitizedImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const safeUrl = sanitizeImageUrl(src);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (safeUrl) {
      el.src = safeUrl;
    } else {
      el.removeAttribute('src');
    }
  }, [safeUrl]);

  if (!safeUrl) {
    return null;
  }

  return <img ref={imgRef} alt={alt} {...props} />;
}
