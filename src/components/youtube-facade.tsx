'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

function extractId(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') {
        id = url.searchParams.get('v') ?? '';
      } else if (['/embed', '/shorts', '/live'].some((prefix) => url.pathname.startsWith(`${prefix}/`))) {
        id = url.pathname.split('/').filter(Boolean)[1] ?? '';
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function YouTubeFacade({
  videoUrl,
  title,
  startSeconds,
}: {
  videoUrl: string | null;
  title: string;
  startSeconds?: number;
}) {
  const [active, setActive] = useState(false);
  const searchParams = useSearchParams();
  const videoId = extractId(videoUrl);

  const queryTime = searchParams?.get('t');
  const parsedSeconds = queryTime ? parseInt(queryTime, 10) : startSeconds;
  const initialStart =
    Number.isFinite(parsedSeconds) && (parsedSeconds ?? 0) > 0
      ? Math.floor(parsedSeconds!)
      : undefined;

  const startQuery = initialStart ? `&start=${initialStart}` : '';

  return (
    <div
      className="video-facade"
      aria-label={videoId ? 'Vídeo do capítulo' : 'Vídeo ainda não disponível'}
    >
      {videoId && active ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0${startQuery}`}
          title={`Vídeo: ${title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : videoId ? (
        <button
          className="play-button"
          type="button"
          aria-label={`Assistir vídeo: ${title}`}
          onClick={() => setActive(true)}
        >
          ▶
        </button>
      ) : (
        <div className="empty-state video-facade-empty">
          <div className="empty-state-mark" aria-hidden="true">
            ▷
          </div>
          <h3>Vídeo em preparação</h3>
          <p>
            O episódio deste capítulo ainda não foi publicado. Volte em breve para acompanhar a
            leitura guiada.
          </p>
        </div>
      )}
      {videoId && (
        <p
          className="field-hint video-spoiler-notice"
          style={{
            marginTop: '8px',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span aria-hidden="true">🛡️</span>
          <span>
            <strong>Atenção com spoilers:</strong> As recomendações automáticas de vídeos ao final
            da reprodução no YouTube podem conter thumbnails ou títulos com revelações da trama de outros canais.
          </span>
        </p>
      )}
    </div>
  );
}
