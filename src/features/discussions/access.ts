import { z } from 'zod';

export const channelAccessReasonSchema = z.enum([
  'ok',
  'unauthenticated',
  'not_member',
  'banned',
  'chapter_locked',
  'chapter_unread',
  'consent_required',
]);

export type ChannelAccessReason = z.infer<typeof channelAccessReasonSchema>;

export interface ChannelAccessState {
  kind: 'accessible' | 'consent_required' | 'chapter_unread' | 'chapter_locked' | 'not_member' | 'banned' | 'unauthenticated';
  canInteract: boolean;
  requiresConsent: boolean;
  badgeLabel: string;
  message: string;
  actionLabel?: string;
}

export function resolveChannelAccessState(
  reason: ChannelAccessReason,
  hasConsent: boolean,
  canRead: boolean,
): ChannelAccessState {
  switch (reason) {
    case 'consent_required':
      return {
        kind: 'consent_required',
        canInteract: false,
        requiresConsent: true,
        badgeLabel: 'Spoiler',
        message: 'Este canal contém spoilers do livro e requer sua confirmação prévia para exibição das mensagens.',
        actionLabel: 'Ver termos e aceitar spoilers',
      };
    case 'ok':
      return {
        kind: 'accessible',
        canInteract: canRead,
        requiresConsent: false,
        badgeLabel: 'Acesso liberado',
        message: 'Você tem acesso liberado para ler e interagir neste canal.',
      };
    case 'chapter_unread':
      return {
        kind: 'chapter_unread',
        canInteract: false,
        requiresConsent: false,
        badgeLabel: 'Capítulo não lido',
        message: 'Para evitar revelações antes da hora, complete a leitura deste capítulo antes de acessar a conversa.',
        actionLabel: 'Abrir capítulo e marcar leitura',
      };
    case 'chapter_locked':
      return {
        kind: 'chapter_locked',
        canInteract: false,
        requiresConsent: false,
        badgeLabel: 'Capítulo bloqueado',
        message: 'Este capítulo ainda não está disponível ou requer a conclusão dos quizzes anteriores.',
        actionLabel: 'Ver cronograma da temporada',
      };
    case 'not_member':
      return {
        kind: 'not_member',
        canInteract: false,
        requiresConsent: false,
        badgeLabel: 'Membros apenas',
        message: 'Este canal é exclusivo para membros participantes do clube.',
        actionLabel: 'Entrar no clube',
      };
    case 'banned':
      return {
        kind: 'banned',
        canInteract: false,
        requiresConsent: false,
        badgeLabel: 'Suspenso',
        message: 'Sua conta possui restrição de participação neste clube conforme as diretrizes da comunidade.',
      };
    case 'unauthenticated':
    default:
      return {
        kind: 'unauthenticated',
        canInteract: false,
        requiresConsent: false,
        badgeLabel: 'Acesso restrito',
        message: 'Faça login na sua conta para participar das discussões da comunidade.',
        actionLabel: 'Entrar',
      };
  }
}
