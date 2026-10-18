import Link from 'next/link';
import type { Book } from '@/features/catalog/queries';
import { BookCover } from '@/components/books/book-cover';

export function BookCard({ book }: { book: Book }) {
  return (
    <Link
      className="book-card"
      href={`/livros/${encodeURIComponent(book.slug)}`}
      aria-label={`${book.title}, ${book.authors?.name ?? 'autor(a) desconhecido'}`}
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
      {book.tags?.length ? (
        <span className="book-card-tags">
          {book.tags.slice(0, 2).map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
        </span>
      ) : null}
    </Link>
  );
}
