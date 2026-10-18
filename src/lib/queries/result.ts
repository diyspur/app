export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'unavailable' | 'unauthenticated' | 'forbidden'; message?: string };

export function querySuccess<T>(data: T): QueryResult<T> {
  return { ok: true, data };
}

export function queryFailure<T = never>(
  code: 'unavailable' | 'unauthenticated' | 'forbidden',
  message?: string,
): QueryResult<T> {
  return { ok: false, code, message };
}
