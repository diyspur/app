import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDomClickObserver, sanitizeHref } from '../../src/lib/telemetry/dom-observer';
import { trackProductEvent } from '../../src/lib/telemetry/product-events';
import { hasAnalyticsConsent } from '../../src/lib/analytics/consent';

vi.mock('../../src/lib/telemetry/product-events', () => ({
  trackProductEvent: vi.fn(),
}));

vi.mock('../../src/lib/analytics/consent', () => ({
  hasAnalyticsConsent: vi.fn(),
}));

class MockElement {
  tagName: string;
  id: string = '';
  private _attrs: Map<string, string> = new Map();
  textContent: string = '';
  parentElement: MockElement | null = null;
  children: MockElement[] = [];

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get attributes(): Array<{ name: string; value: string }> {
    const list: Array<{ name: string; value: string }> = [];
    for (const [name, value] of this._attrs.entries()) {
      list.push({ name, value });
    }
    return list;
  }

  setAttribute(name: string, value: string) {
    const lower = name.toLowerCase();
    this._attrs.set(lower, value);
    if (lower === 'id') this.id = value;
  }

  getAttribute(name: string): string | null {
    const lower = name.toLowerCase();
    if (lower === 'id') return this.id || null;
    return this._attrs.get(lower) ?? null;
  }

  hasAttribute(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower === 'id') return Boolean(this.id);
    return this._attrs.has(lower);
  }

  removeAttribute(name: string) {
    const lower = name.toLowerCase();
    if (lower === 'id') this.id = '';
    this._attrs.delete(lower);
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  closest(selector: string): MockElement | null {
    const selectors = selector.split(',').map((s) => s.trim().toLowerCase());
    for (const sel of selectors) {
      if (sel === 'button' && this.tagName === 'BUTTON') return this;
      if (sel === 'a' && this.tagName === 'A') return this;
      if (sel === 'a[href]' && this.tagName === 'A' && this.hasAttribute('href')) return this;
      if (sel === 'input[type="submit"]' && this.tagName === 'INPUT' && this.getAttribute('type') === 'submit') return this;
      if (sel === 'input[type="button"]' && this.tagName === 'INPUT' && this.getAttribute('type') === 'button') return this;
      if (sel === '[role="button"]' && this.getAttribute('role') === 'button') return this;
      if (sel === '[data-telemetry-event]' && this.hasAttribute('data-telemetry-event')) return this;
      if (sel === '[data-telemetry-id]' && this.hasAttribute('data-telemetry-id')) return this;
      if (sel === '[data-telemetry-ignore]' && this.hasAttribute('data-telemetry-ignore')) return this;
    }
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }
}

describe('DOM Click Observer Telemetry (Task 5)', () => {
  let clickListeners: Array<(event: unknown) => void> = [];

  const triggerClick = (target: MockElement) => {
    const event = {
      target,
      currentTarget: global.document,
      type: 'click',
      bubbles: true,
      cancelable: true,
    };
    for (const listener of [...clickListeners]) {
      listener(event);
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clickListeners = [];

    vi.mocked(hasAnalyticsConsent).mockReturnValue(true);

    const mockDoc = {
      addEventListener: vi.fn((event: string, listener: (ev: unknown) => void) => {
        if (event === 'click') clickListeners.push(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: (ev: unknown) => void) => {
        if (event === 'click') {
          clickListeners = clickListeners.filter((l) => l !== listener);
        }
      }),
      createElement: vi.fn((tag: string) => new MockElement(tag)),
    };

    const mockWin = {
      location: {
        pathname: '/livros/dom-casmurro',
      },
    };

    // @ts-expect-error test mock
    global.document = mockDoc;
    // @ts-expect-error test mock
    global.window = mockWin;
  });

  afterEach(() => {
    // @ts-expect-error cleanup
    delete global.document;
    // @ts-expect-error cleanup
    delete global.window;
  });

  it('captura clique em botão semântico e despacha cta_clicked com metadados seguros', () => {
    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-add-queue';
    button.textContent = 'Adicionar à Fila';
    button.setAttribute('data-telemetry-placement', 'book_hero');

    triggerClick(button);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('cta_clicked', {
      cta_id: 'btn-add-queue',
      text_content: 'Adicionar à Fila',
      page_path: '/livros/dom-casmurro',
      placement: 'book_hero',
      element_tag: 'BUTTON',
      element_role: 'button',
    });

    cleanup();
  });

  it('captura clique originado em elemento filho de um botão (ex: span/ícone)', () => {
    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-like';
    button.textContent = 'Favoritar';

    const span = new MockElement('span');
    span.textContent = '❤️';
    button.appendChild(span);

    triggerClick(span);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('cta_clicked', expect.objectContaining({
      cta_id: 'btn-like',
      text_content: 'Favoritar',
      element_tag: 'BUTTON',
    }));

    cleanup();
  });

  it('avalia aria-label quando textContent contém apenas espaços em branco', () => {
    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-close';
    button.textContent = '   \n  \t  ';
    button.setAttribute('aria-label', 'Fechar modal');

    triggerClick(button);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('cta_clicked', expect.objectContaining({
      cta_id: 'btn-close',
      text_content: 'Fechar modal',
      element_tag: 'BUTTON',
    }));

    cleanup();
  });

  it('captura clique em link <a> e sanitiza href removendo query strings com tokens ou segredos', () => {
    const cleanup = setupDomClickObserver();

    const link = new MockElement('a');
    link.id = 'link-auth';
    link.textContent = 'Fazer Login';
    link.setAttribute('href', '/auth/callback?code=supersecret123&token=jwt.abc.xyz&redirect=/catalogo');
    link.setAttribute('target', '_blank');

    triggerClick(link);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('cta_clicked', expect.objectContaining({
      cta_id: 'link-auth',
      text_content: 'Fazer Login',
      target: '_blank',
      element_tag: 'A',
      element_role: 'link',
    }));

    // Verifica que code e token foram removidos da URL, preservando redirect seguro
    const payload = vi.mocked(trackProductEvent).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.href).toContain('redirect=%2Fcatalogo');
    expect(payload.href).not.toContain('supersecret123');
    expect(payload.href).not.toContain('jwt.abc.xyz');

    cleanup();
  });

  it('captura clique em elemento customizado com data-telemetry-event e propriedades extras', () => {
    const cleanup = setupDomClickObserver();

    const div = new MockElement('div');
    div.setAttribute('data-telemetry-event', 'book_added_to_queue');
    div.setAttribute('data-telemetry-id', 'queue-card');
    div.setAttribute('data-telemetry-prop-book-slug', 'dom-casmurro');
    div.setAttribute('data-telemetry-prop-position', '1');
    div.textContent = 'Colocar na Fila';

    triggerClick(div);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('book_added_to_queue', expect.objectContaining({
      cta_id: 'queue-card',
      book_slug: 'dom-casmurro',
      position: '1',
      text_content: 'Colocar na Fila',
    }));

    cleanup();
  });

  it('trunca text_content quando ultrapassar 100 caracteres', () => {
    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-long';
    button.textContent = 'Texto extremamente longo para um botão '.repeat(5); // ~190 chars

    triggerClick(button);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(trackProductEvent).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(typeof payload.text_content).toBe('string');
    expect((payload.text_content as string).length).toBeLessThanOrEqual(100);

    cleanup();
  });

  it('redige PII presente no text_content e em atributos de rótulo (email, CPF, cartão, tokens)', () => {
    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-user';
    button.textContent = 'Falar com suporte: rafael@diyspur.com.br';

    triggerClick(button);

    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(trackProductEvent).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.text_content).not.toContain('rafael@diyspur.com.br');
    expect(payload.text_content).toContain('r***@***.com.br');

    cleanup();
  });

  it('Fail-Closed: não despacha nenhum evento quando hasAnalyticsConsent() for false', () => {
    vi.mocked(hasAnalyticsConsent).mockReturnValue(false);

    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-blocked';
    button.textContent = 'Não Rastrear';

    triggerClick(button);

    expect(trackProductEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it('ignora cliques em elementos com data-telemetry-ignore ou descendentes', () => {
    const cleanup = setupDomClickObserver();

    const button = new MockElement('button');
    button.id = 'btn-ignored';
    button.setAttribute('data-telemetry-ignore', 'true');
    button.textContent = 'Ignorado';

    triggerClick(button);

    expect(trackProductEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it('remove listener ao executar a função de cleanup retornada', () => {
    const cleanup = setupDomClickObserver();
    expect(clickListeners.length).toBe(1);

    const button = new MockElement('button');
    button.id = 'btn-active';
    button.textContent = 'Ativo';

    triggerClick(button);
    expect(trackProductEvent).toHaveBeenCalledTimes(1);

    cleanup();
    expect(clickListeners.length).toBe(0);

    triggerClick(button);
    expect(trackProductEvent).toHaveBeenCalledTimes(1); // Não incrementou
  });

  describe('sanitizeHref helper', () => {
    it('mantém URLs relativas simples e limpas', () => {
      expect(sanitizeHref('/livros')).toBe('/livros');
      expect(sanitizeHref('/livros?genre=ficcao')).toBe('/livros?genre=ficcao');
      expect(sanitizeHref('#capitulo-2')).toBe('#capitulo-2');
    });

    it('remove parâmetros de busca com segredos e tokens', () => {
      const sanitized = sanitizeHref('/auth?code=12345&token=jwt.abc&ref=diyspur');
      expect(sanitized).toBe('/auth?ref=diyspur');
    });
  });
});
