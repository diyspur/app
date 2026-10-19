export function localDateInputValue(date = new Date()): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function readingYearInSaoPaulo(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en', {
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(date)
  );
}
