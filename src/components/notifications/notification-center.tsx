'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { NotificationItem } from './notification-item';
import { useNotifications } from './notification-provider';

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const {
    items,
    unreadCount,
    loading,
    loadingMore,
    error,
    nextCursor,
    unreadOnly,
    setUnreadOnly,
    refresh,
    loadMore,
    markOneRead,
    markAllRead,
  } = useNotifications();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    return () => {
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        dialogRef.current &&
        target &&
        !dialogRef.current.contains(target) &&
        !(target as HTMLElement).closest?.('[data-notification-bell]')
      ) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="notification-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        id="notification-center-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        className="notification-popover"
      >
        <div className="notification-popover-header">
          <div>
            <h2 id="notification-center-title" className="notification-popover-heading">
              Notificações
            </h2>
            <p className="notification-popover-subtitle">
              {unreadCount > 0
                ? `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}`
                : 'Tudo em dia'}
            </p>
          </div>
          <div className="notification-popover-actions">
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void markAllRead()}
              >
                Marcar todas como lidas
              </button>
            )}
            <button
              type="button"
              className="notification-close-btn"
              onClick={onClose}
              aria-label="Fechar central de notificações"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="notification-filter-tabs" role="tablist" aria-label="Filtrar notificações">
          <button
            type="button"
            role="tab"
            aria-selected={!unreadOnly}
            aria-pressed={!unreadOnly}
            className={`notification-filter-tab ${!unreadOnly ? 'active' : ''}`}
            onClick={() => setUnreadOnly(false)}
          >
            Todas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={unreadOnly}
            aria-pressed={unreadOnly}
            className={`notification-filter-tab ${unreadOnly ? 'active' : ''}`}
            onClick={() => setUnreadOnly(true)}
          >
            Não lidas {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        </div>

        <div className="notification-popover-body">
          {loading ? (
            <div className="notification-popover-state" role="status" aria-live="polite">
              Carregando notificações…
            </div>
          ) : error ? (
            <div className="notification-popover-state" role="alert">
              <p>Não foi possível carregar suas notificações.</p>
              <button
                type="button"
                className="button button-small"
                onClick={() => void refresh()}
              >
                Tentar novamente
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="notification-popover-state">
              <p>
                {unreadOnly
                  ? 'Nenhuma notificação não lida no momento.'
                  : 'Por enquanto, tudo tranquilo nas suas conversas e encontros.'}
              </p>
            </div>
          ) : (
            <ol className="notification-popover-list" aria-label="Notificações recentes">
              {items.map((item) => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  onMarkRead={markOneRead}
                  onNavigate={onClose}
                />
              ))}
            </ol>
          )}

          {nextCursor && !loading && !error && (
            <div className="notification-popover-more">
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-block"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Carregando…' : 'Carregar anteriores'}
              </button>
            </div>
          )}
        </div>

        <div className="notification-popover-footer">
          <Link
            href="/notificacoes"
            className="text-link"
            onClick={onClose}
          >
            Ver página completa e preferências →
          </Link>
        </div>
      </div>
    </>
  );
}
