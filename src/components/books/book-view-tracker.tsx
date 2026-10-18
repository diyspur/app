'use client';

import { useEffect } from 'react';
import { saveBookInteraction } from '@/features/recommendations/browser-storage';

interface BookViewTrackerProps {
  book: {
    id: string;
    slug: string;
    title: string;
    tags?: string[] | null;
    author_id?: string | null;
  };
}

export function BookViewTracker({ book }: BookViewTrackerProps) {
  useEffect(() => {
    saveBookInteraction({
      bookId: book.id,
      slug: book.slug,
      title: book.title,
      tags: book.tags,
      author_id: book.author_id,
      type: 'view',
    });
  }, [book.id, book.slug, book.title, book.tags, book.author_id]);

  return null;
}
