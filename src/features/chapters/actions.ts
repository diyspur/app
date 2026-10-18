'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/actions/read-only';
import { requireSession } from '@/lib/auth/session';
import { withTelemetryAction } from '@/lib/observability/action-wrapper';
import type { createServerSupabase } from '@/lib/supabase/clients';
import { commentSchema, progressSchema, type ChapterActionResult } from './schemas';

async function currentUserId() {
  const session = await requireSession();
  return session ? { supabase: session.client, userId: session.userId } : null;
}

async function awardActivity(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  source: 'finish_chapter' | 'comment',
  refId: string,
): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('award-xp', {
    body: { source, ref_id: refId },
  });
  if (error || !data || data.ok !== true) {
    console.error('Activity XP pending', source, error?.name ?? 'invalid_response');
    return false;
  }
  return true;
}

async function chapterIsAvailable(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  chapterId: string,
) {
  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('season_id,published_at')
    .eq('id', chapterId)
    .maybeSingle();
  if (error || !chapter || (chapter.published_at && Date.parse(chapter.published_at) > Date.now()))
    return false;
  const { data: season } = await supabase
    .from('seasons')
    .select('status')
    .eq('id', chapter.season_id)
    .maybeSingle();
  return Boolean(season && ['active', 'finished'].includes(season.status));
}

export async function createChapterComment(input: unknown): Promise<ChapterActionResult> {
  return withTelemetryAction(
    'chapters.submitChapterComment',
    async (inp) => {
      if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      const parsed = commentSchema.safeParse(inp);
      if (!parsed.success)
        return { ok: false, message: parsed.error.issues[0]?.message ?? 'Confira os dados do comentário.' };
      const session = await currentUserId();
      if (!session) return { ok: false, message: 'Entre na sua conta para comentar.' };

      const { chapterId, content, isSpoiler, minPercent } = parsed.data;
      if (!(await chapterIsAvailable(session.supabase, chapterId)))
        return { ok: false, message: 'Este capítulo ainda não está disponível para interação.' };
      const { data: insertedComment, error } = await session.supabase
        .from('comments')
        .insert({
          chapter_id: chapterId,
          user_id: session.userId,
          content,
          is_spoiler: isSpoiler,
          min_percent: isSpoiler ? (minPercent ?? 100) : 0,
        })
        .select('id')
        .single();
      if (error) {
        console.error('Comment write failed', error.code);
        return {
          ok: false,
          message:
            error.code === '42501'
              ? 'Sua sessão não permite publicar este comentário.'
              : 'Não foi possível publicar agora. Tente novamente.',
        };
      }
      const xpAwarded = insertedComment?.id ? await awardActivity(session.supabase, 'comment', insertedComment.id) : false;
      revalidatePath(`/capitulos/${chapterId}`);
      revalidatePath('/comunidade');
      return {
        ok: true,
        message: xpAwarded ? 'Comentário publicado.' : 'Comentário publicado. O XP será sincronizado automaticamente.',
      };
    },
    {
      resourceExtractor: (inp) => {
        if (inp && typeof inp === 'object' && 'chapterId' in inp) {
          return { chapterId: String((inp as { chapterId: unknown }).chapterId) };
        }
        return {};
      },
    }
  )(input);
}

const commentEditSchema = z.object({
  commentId: z.string().uuid(),
  chapterId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

export async function getOwnChapterCommentForEdit(
  input: unknown,
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const parsed = z.object({ commentId: z.string().uuid(), chapterId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'O comentário informado não é válido.' };
  const session = await currentUserId();
  if (!session) return { ok: false, message: 'Entre novamente para editar seu comentário.' };
  const { data, error } = await session.supabase.rpc('get_own_chapter_comment_for_edit', {
    p_comment_id: parsed.data.commentId,
    p_chapter_id: parsed.data.chapterId,
  });
  if (error || typeof data !== 'string')
    return { ok: false, message: 'Não foi possível carregar seu comentário para edição.' };
  return { ok: true, content: data };
}

export async function editChapterComment(input: unknown): Promise<ChapterActionResult> {
  if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  const parsed = commentEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'O comentário informado não é válido.' };
  const session = await currentUserId();
  if (!session) return { ok: false, message: 'Entre novamente para editar seu comentário.' };
  if (!(await chapterIsAvailable(session.supabase, parsed.data.chapterId)))
    return { ok: false, message: 'Este capítulo não está disponível para interação.' };
  const { data, error } = await session.supabase
    .from('comments')
    .update({ content: parsed.data.content, edited_at: new Date().toISOString() })
    .eq('id', parsed.data.commentId)
    .eq('chapter_id', parsed.data.chapterId)
    .eq('user_id', session.userId)
    .select('id')
    .maybeSingle();
  if (error || !data) return { ok: false, message: 'Não foi possível editar este comentário.' };
  revalidatePath(`/capitulos/${parsed.data.chapterId}`);
  revalidatePath('/comunidade');
  return { ok: true };
}

export async function deleteChapterComment(input: unknown): Promise<ChapterActionResult> {
  if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
  const parsed = z.object({ commentId: z.string().uuid(), chapterId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'O comentário informado não é válido.' };
  const session = await currentUserId();
  if (!session) return { ok: false, message: 'Entre novamente para remover seu comentário.' };
  const { data, error } = await session.supabase.rpc('remove_own_chapter_comment', {
    p_comment_id: parsed.data.commentId,
    p_chapter_id: parsed.data.chapterId,
  });
  if (error || data !== true) return { ok: false, message: 'Não foi possível remover este comentário.' };
  revalidatePath(`/capitulos/${parsed.data.chapterId}`);
  revalidatePath('/comunidade');
  return { ok: true };
}

export async function saveChapterProgress(input: unknown): Promise<ChapterActionResult> {
  return withTelemetryAction(
    'chapters.markChapterRead',
    async (inp) => {
      if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      const parsed = progressSchema.safeParse(inp);
      if (!parsed.success) return { ok: false, message: 'O progresso informado não é válido.' };
      const session = await currentUserId();
      if (!session) return { ok: false, message: 'Entre na sua conta para salvar seu progresso.' };

      const { chapterId, status, percent } = parsed.data;
      if (!(await chapterIsAvailable(session.supabase, chapterId)))
        return { ok: false, message: 'Este capítulo ainda não está disponível para progresso.' };
      const { data: currentProgress } = await session.supabase
        .from('user_progress')
        .select('status,percent,started_at,finished_at')
        .eq('user_id', session.userId)
        .eq('chapter_id', chapterId)
        .maybeSingle();
      const finished = status === 'read';
      if (!finished && currentProgress?.status === 'read') {
        return { ok: false, message: 'Este capítulo já foi concluído e não pode regredir.' };
      }
      const { error } = await session.supabase.from('user_progress').upsert(
        {
          user_id: session.userId,
          chapter_id: chapterId,
          status,
          percent: finished ? 100 : Math.max(0, Math.min(99, percent ?? currentProgress?.percent ?? 1)),
          started_at: currentProgress?.started_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          finished_at: finished ? (currentProgress?.finished_at ?? new Date().toISOString()) : null,
        },
        { onConflict: 'user_id,chapter_id' },
      );
      if (error) {
        console.error('Progress write failed', error.code);
        return {
          ok: false,
          message:
            error.code === '42501'
              ? 'Sua sessão não permite alterar este progresso.'
              : 'Não foi possível salvar o progresso agora.',
        };
      }
      revalidatePath(`/capitulos/${chapterId}`);
      revalidatePath('/perfil');
      revalidatePath('/historico');
      const xpAwarded = finished
        ? await awardActivity(session.supabase, 'finish_chapter', chapterId)
        : true;
      return {
        ok: true,
        message: xpAwarded
          ? 'Progresso salvo.'
          : 'Progresso salvo. O XP será sincronizado automaticamente.',
      };
    },
    {
      resourceExtractor: (inp) => {
        if (inp && typeof inp === 'object' && 'chapterId' in inp) {
          return {
            chapterId: String((inp as { chapterId: unknown }).chapterId),
            status: String((inp as { status?: unknown }).status ?? ''),
          };
        }
        return {};
      },
    }
  )(input);
}

const quizSubmissionSchema = z.object({
  chapterId: z.string().uuid(),
  requestId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        chosen_idx: z.number().int().min(0).max(25),
      }),
    )
    .min(1)
    .max(50),
});
export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;
export type QuizResult =
  | { ok: false; message: string }
  | { ok: true; score: number; total: number; duplicate: boolean };

export async function submitChapterQuiz(input: unknown): Promise<QuizResult> {
  return withTelemetryAction<[unknown], QuizResult>(
    'chapters.submitChapterQuiz',
    async (inp: unknown): Promise<QuizResult> => {
      if (isReadOnlyPreview()) return { ok: false, message: READ_ONLY_PREVIEW_MESSAGE };
      const parsed = quizSubmissionSchema.safeParse(inp);
      if (!parsed.success) return { ok: false, message: 'As respostas do quiz não são válidas.' };
      const session = await currentUserId();
      if (!session) return { ok: false, message: 'Entre na sua conta para responder ao quiz.' };

      const { data: authData, error: sessionError } = await session.supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (sessionError || !accessToken || authData.session?.user.id !== session.userId) {
        return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
      }
      const { data, error } = await session.supabase.functions.invoke('quiz-validate', {
        body: { chapter_id: parsed.data.chapterId, answers: parsed.data.answers },
        headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': parsed.data.requestId },
      });
      if (error || !data || typeof data.score !== 'number' || typeof data.total !== 'number') {
        console.error('Quiz submission failed', error?.name ?? 'invalid_response');
        return {
          ok: false,
          message: error?.message?.includes('429')
            ? 'Você atingiu o limite de tentativas. Aguarde um minuto.'
            : 'Não foi possível validar o quiz agora. Suas respostas não foram confirmadas.',
        };
      }
      revalidatePath('/perfil');
      revalidatePath('/historico');
      return { ok: true, score: data.score, total: data.total, duplicate: Boolean(data.duplicate) };
    },
    {
      resourceExtractor: (inp) => {
        if (inp && typeof inp === 'object' && 'chapterId' in inp) {
          return { chapterId: String((inp as { chapterId: unknown }).chapterId) };
        }
        return {};
      },
    }
  )(input);
}
