'use client';

import { useEffect, useState } from 'react';
import type { Book } from '@/features/catalog/queries';
import { BookCard } from '@/components/book-card';
import { getStoredInteractions } from '@/features/recommendations/browser-storage';
import { rankCatalogBooks } from '@/features/recommendations/tensorflow-recommender';

interface PersonalizedCatalogProps {
  initialBooks: Book[];
  isServerPersonalized?: boolean;
}

export function PersonalizedCatalog({
  initialBooks,
  isServerPersonalized = false,
}: PersonalizedCatalogProps) {
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [hasClientBoost, setHasClientBoost] = useState(false);

  useEffect(() => {
    // If server already personalized via database readings, keep the server foundation
    // unless we also have fresh browser clicks to incorporate
    const interactions = getStoredInteractions();
    if (!interactions.length) {
      setBooks(initialBooks);
      return;
    }

    try {
      // Re-rank candidate books using TensorFlow.js with the browser memory items (clicks/views)
      const ranked = rankCatalogBooks(initialBooks, null, {
        interactions,
      });

      const hasRecommendations = ranked.some((b) => b.isRecommended);
      if (hasRecommendations) {
        setBooks(ranked);
        setHasClientBoost(true);
      }
    } catch (err) {
      console.warn('[PersonalizedCatalog] Fallback to initial order:', err);
      setBooks(initialBooks);
    }
  }, [initialBooks]);

  return (
    <>
      {hasClientBoost && !isServerPersonalized && (
        <p className="field-hint" style={{ marginTop: '8px' }} role="status">
          ✦ Recomendações atualizadas com base nos livros que você visualizou recentemente no clube.
        </p>
      )}
      <div className="book-grid section">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </>
  );
}
