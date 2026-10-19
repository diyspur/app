export type ShelfStatus = 'want_to_read' | 'reading' | 'read' | 'dnf';

export interface ShelfStatusPresentation {
  label: string;
  badgeClass: string;
  description: string;
}

export const SHELF_STATUS_MAP: Record<ShelfStatus, ShelfStatusPresentation> = {
  want_to_read: {
    label: 'Quero ler',
    badgeClass: 'status-pill status-pill-neutral',
    description: 'Salvo para ler no futuro',
  },
  reading: {
    label: 'Em andamento',
    badgeClass: 'status-pill status-pill-active',
    description: 'Lendo no momento',
  },
  read: {
    label: 'Concluído',
    badgeClass: 'status-pill status-pill-success',
    description: 'Livro finalizado',
  },
  dnf: {
    label: 'Abandonei/Não concluído',
    badgeClass: 'status-pill status-pill-muted',
    description: 'Leitura não concluída ou abandonada',
  },
};

export function getShelfStatusPresentation(status: ShelfStatus | string | null | undefined): ShelfStatusPresentation {
  if (status && status in SHELF_STATUS_MAP) {
    return SHELF_STATUS_MAP[status as ShelfStatus];
  }
  return {
    label: status ?? 'Sem status',
    badgeClass: 'status-pill',
    description: '',
  };
}
