import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { memberLinks } from '@/lib/member-navigation';
import { DesktopNav } from '@/components/desktop-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('Member Navigation Links', () => {
  it('contains exactly all 10 unified personal destinations', () => {
    expect(memberLinks).toHaveLength(10);
    const hrefs = memberLinks.map((link) => link.href);

    expect(hrefs).toEqual([
      '/perfil',
      '/historico',
      '/diario',
      '/metas',
      '/minha-fila',
      '/listas',
      '/leituras-compartilhadas',
      '/desafios',
      '/ranking',
      '/notificacoes',
    ]);
  });

  it('has descriptive non-empty Portuguese labels for every link', () => {
    for (const link of memberLinks) {
      expect(link.label.length).toBeGreaterThan(2);
      expect(link.href.startsWith('/')).toBe(true);
    }
  });
});

describe('DesktopNav Keyboard Accessibility (QA-16)', () => {
  it('renders standard accessible navigation without menu or menuitem roles', () => {
    const html = renderToStaticMarkup(React.createElement(DesktopNav, { signedIn: true }));
    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('role="menuitem"');
  });

  it('provides aria-expanded and aria-controls for accessible disclosures', () => {
    const html = renderToStaticMarkup(React.createElement(DesktopNav, { signedIn: true }));
    expect(html).toContain('aria-controls="nav-community-menu"');
    expect(html).toContain('aria-controls="nav-personal-menu"');
    expect(html).toContain('id="nav-community-menu"');
    expect(html).toContain('id="nav-personal-menu"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders anonymous navigation disclosure correctly without personal menu', () => {
    const html = renderToStaticMarkup(React.createElement(DesktopNav, { signedIn: false }));
    expect(html).toContain('aria-controls="nav-community-menu"');
    expect(html).not.toContain('aria-controls="nav-personal-menu"');
    expect(html).toContain('href="/diario"');
  });
});
