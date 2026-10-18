'use server';

import { revalidatePath } from 'next/cache';
import { mapDatabaseError } from '@/lib/actions/database-errors';
import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/actions/read-only';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import { createServerSupabase } from '@/lib/supabase/clients';
import type { MyBookReadingState } from './queries';
import { setBookReadingSchema, type BookReadingStatus } from './schemas';

export async function setMyBookReadingAction(input: {
  bookId: string;
  bookSlug?: string;
  status: BookReadingStatus;
  version: number;
  requestId: string;
}): Promise<{
  ok: boolean;
  message: string;
  state?: MyBookReadingState;
}> {
  return withTelemetryAction(
    'reading.setBookReadingStatus',
    async (inp: {
      bookId: string;
      bookSlug?: string;
      status: BookReadingStatus;
      version: number;
      requestId: string;
    }) => {
      if (isReadOnlyPreview()) {
        return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      }

      const parsed = setBookReadingSchema.safeParse(inp);
      if (!parsed.success) {
        return {
          ok: false,
          message: parsed.error.issues[0]?.message ?? 'Status de leitura inválido.',
        };
      }

      try {
        const supabase = await createServerSupabase();
        const { data, error } = await supabase.rpc('set_my_book_reading', {
          p_book: parsed.data.bookId,
          p_status: parsed.data.status,
          p_version: parsed.data.version,
          p_request_id: parsed.data.requestId,
        });

        if (error || !data?.[0]) {
          const mapped = mapDatabaseError(error?.code, error?.message);
          return { ok: false, message: mapped.message };
        }

        const row = data[0];
        if (parsed.data.bookSlug) {
          revalidatePath(`/livros/${parsed.data.bookSlug}`);
        }
        revalidatePath('/livros');
        revalidatePath('/perfil');
        revalidatePath('/historico');
        revalidatePath('/metas');
        revalidatePath('/ranking');

        try {
          const { data: claims } = await supabase.auth.getClaims();
          const readerId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;
          if (readerId) {
            const { invalidateUserRanking } = await import('@/features/recommendations/recommender-cache');
            invalidateUserRanking(readerId);
          }
        } catch {
          // Non-blocking cache invalidation fallback
        }

        const statusLabel: Record<BookReadingStatus, string> = {
          want_to_read: 'Quero ler',
          reading: 'Lendo agora',
          read: 'Livro marcado como lido!',
          dnf: 'Leitura pausada / abandonada',
        };

        const status = row.status as BookReadingStatus;

        return {
          ok: true,
          message: statusLabel[status] ?? 'Status de leitura atualizado.',
          state: {
            bookId: row.book_id,
            status,
            source: row.source,
            firstStartedAt: row.first_started_at,
            firstCompletedAt: row.first_completed_at,
            completedAt: row.completed_at,
            updatedAt: row.updated_at,
            version: row.version,
          },
        };
      } catch {
        return {
          ok: false,
          message: 'Não foi possível atualizar seu status de leitura agora.',
        };
      }
    },
    {
      resourceExtractor: (inp) => ({
        bookId: inp.bookId,
        bookSlug: inp.bookSlug,
        status: inp.status,
      }),
    }
  )(input);
}
