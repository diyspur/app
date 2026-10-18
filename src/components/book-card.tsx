'use client';

import Link from 'next/link';
import type { Book } from '@/features/catalog/queries';
import { BookCover } from '@/components/books/book-cover';
import { saveBookInteraction } from '@/features/recommendations/browser-storage';

export function BookCard({ book }: { book: Book }) {
  const handleClick = () => {
    saveBookInteraction({
      bookId: book.id,
      slug: book.slug,
      title: book.title,
      tags: book.tags,
      author_id: book.author_id,
      type: 'click',
    });
  };

  return (
    <Link
      className="book-card"
      href={`/livros/${encodeURIComponent(book.slug)}`}
      aria-label={`${book.title}, ${book.authors?.name ?? 'autor(a) desconhecido'}`}
      onClick={handleClick}
    >
      <div className="book-card-cover">
        <BookCover
          src={book.cover_url}
          title={book.title}
          width={300}
          height={450}
          sizes="(max-width: 768px) 100vw, 300px"
        />
      </div>
      <h3>{book.title}</h3>
      <p>{book.authors?.name ?? 'Autor(a) convidado(a)'}</p>
      {book.isRecommended && book.recommendationReason ? (
        <p className="book-card-reason" title={book.recommendationReason}>
          {book.recommendationReason}
        </p>
      ) : null}
      <div className="book-card-tags">
        {book.isRecommended ? (
          <span
            className="tag tag-recommended"
            title={book.recommendationReason ?? 'Recomendado com base nas suas leituras'}
            aria-label={`★ Recomendado${book.recommendationReason ? `: ${book.recommendationReason}` : ''}`}
          >
            ★ Recomendado
          </span>
        ) : null}
        {book.readingStatus === 'reading' && (
          <span className="tag tag-reading">Lendo</span>
        )}
        {book.readingStatus === 'read' && (
          <span className="tag tag-read">Já li</span>
        )}
        {book.readingStatus === 'dnf' && (
          <span className="tag tag-dnf">Desistiu</span>
        )}
        {book.readingStatus === 'want_to_read' && (
          <span className="tag tag-want-to-read">Quero ler</span>
        )}
        {book.tags?.slice(0, 2).map((tag) => (
          <span className="tag" key={tag}>{tag}</span>
        ))}
      </div>
    </Link>
  );
}
