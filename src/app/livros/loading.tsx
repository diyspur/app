export default function BooksLoading() {
  return (
    <section className="container" aria-label="Carregando catálogo">
      <div className="page-intro">
        <span className="eyebrow">A biblioteca do clube</span>
        <div className="display-title" aria-live="polite">Carregando leituras…</div>
      </div>
      <div className="book-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="book-card" aria-hidden="true">
            <div className="book-card-cover skeleton" />
            <div className="notice" style={{ marginTop: 12 }}>
              Preparando a estante
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
