'use client';

import Image from 'next/image';
import { useState } from 'react';

type BookCoverProps = {
  src: string | null;
  title: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

export function BookCover({
  src,
  title,
  width = 300,
  height = 450,
  className = '',
  priority = false,
  sizes = '(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 300px',
}: BookCoverProps) {
  const [errorSrc, setErrorSrc] = useState<string | null>(null);

  const hasFailed = !src || errorSrc === src;

  if (hasFailed) {
    return (
      <div
        className={`book-cover-placeholder ${className}`}
        role="img"
        aria-label={`Capa indisponível para ${title}`}
      >
        <span>{title}</span>
      </div>
    );
  }

  return (
    <Image
      alt={`Capa do livro ${title}`}
      className={className}
      height={height}
      onError={() => setErrorSrc(src)}
      priority={priority}
      sizes={sizes}
      src={src}
      width={width}
    />
  );
}
