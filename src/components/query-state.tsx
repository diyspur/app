'use client';

import React from 'react';
import type { QueryResult } from '@/lib/queries/result';

export type QueryStateProps<T> = {
  result: QueryResult<T>;
  onRetry?: () => void;
  children: React.ReactNode | ((data: T) => React.ReactNode);
  emptyPredicate?: (data: T) => boolean;
  emptyFallback?: React.ReactNode;
};

export function QueryState<T>({
  result,
  onRetry,
  children,
  emptyPredicate,
  emptyFallback,
}: QueryStateProps<T>) {
  if (!result.ok) {
    const errorCode = result.code;
    const title =
      errorCode === 'unauthenticated'
        ? 'Sessão necessária'
        : errorCode === 'forbidden'
          ? 'Acesso restrito'
          : 'Não foi possível carregar as informações';

    const message =
      result.message ||
      (errorCode === 'unauthenticated'
        ? 'Faça login para acessar suas informações com segurança.'
        : errorCode === 'forbidden'
          ? 'Você não tem permissão para visualizar estas informações.'
          : 'Ocorreu uma instabilidade na consulta. Seus dados estão seguros.');

    return (
      <div
        className={`card notice-banner notice-${errorCode}`}
        role="alert"
        data-error-code={errorCode}
      >
        <h3>{title}</h3>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="button button-small" onClick={onRetry}>
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  const isEmpty = emptyPredicate
    ? emptyPredicate(result.data)
    : Array.isArray(result.data) && result.data.length === 0;

  if (isEmpty && emptyFallback) {
    return <>{emptyFallback}</>;
  }

  if (typeof children === 'function') {
    return <>{(children as (data: T) => React.ReactNode)(result.data)}</>;
  }

  return <>{children}</>;
}
