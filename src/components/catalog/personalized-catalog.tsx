'use client';

import { useEffect, useState } from 'react';
import type { Book } from '@/features/catalog/queries';
import type { BookReadingStatus } from '@/features/reading/schemas';
import { BookCard } from '@/components/book-card';
import { getStoredInteractions } from '@/features/recommendations/browser-storage';

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

    let isMounted = true;

    async function reRankWithInteractions() {
      try {
        // Extrair mapa de leituras do servidor
        const serverReadings = new Map<string, BookReadingStatus>();
        for (const b of initialBooks) {
          if (b.readingStatus) {
            serverReadings.set(b.id, b.readingStatus as BookReadingStatus);
          }
        }

        // Import dinâmico sob demanda
        const { rankCatalogBooks } = await import(
          '@/features/recommendations/tensorflow-recommender'
        );
        const ranked = rankCatalogBooks(initialBooks, serverReadings, {
          interactions,
        });

        if (!isMounted) return;

        const hasRecommendations = ranked.some((b) => b.isRecommended);
        if (hasRecommendations) {
          setBooks(ranked);
          setHasClientBoost(true);
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('[PersonalizedCatalog] Fallback to initial order:', err);
        setBooks(initialBooks);
      }
    }

    void reRankWithInteractions();

    return () => {
      isMounted = false;
    };
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
