'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { memberLinks } from '@/lib/member-navigation';

export function DesktopNav({ signedIn = false }: { signedIn?: boolean }) {
  const [openDropdown, setOpenDropdown] = useState<'community' | 'personal' | null>(null);
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);

  // Fecha dropdowns na mudança de rota
  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  // Fecha ao clicar fora ou pressionar Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenDropdown((current) => {
          if (current) {
            const trigger = navRef.current?.querySelector<HTMLButtonElement>(
              `button[aria-controls="nav-${current}-menu"]`
            );
            trigger?.focus();
          }
          return null;
        });
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function handleDropdownBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpenDropdown(null);
    }
  }

  const isExploreActive =
    pathname.startsWith('/livros') ||
    pathname.startsWith('/temporadas') ||
    pathname.startsWith('/capitulos');
  const isCommunityActive =
    pathname.startsWith('/comunidade') ||
    pathname.startsWith('/clubes') ||
    pathname.startsWith('/calendario') ||
    pathname.startsWith('/eventos') ||
    pathname.startsWith('/votacao');
  const isPersonalActive = memberLinks.some(
    (link) => pathname === link.href || pathname.startsWith(link.href + '/')
  );
  const isJournalActive = pathname.startsWith('/diario');

  return (
    <nav className="nav-links" aria-label="Navegação principal" ref={navRef}>
      {/* Link Direto: Livros */}
      <Link className={isExploreActive ? 'active' : ''} href="/livros">
        Livros
      </Link>

      {/* Menu Dropdown: Comunidade */}
      <div className="nav-dropdown" onBlur={handleDropdownBlur}>
        <button
          type="button"
          className={`nav-dropdown-trigger ${isCommunityActive ? 'active' : ''}`}
          onClick={() => setOpenDropdown((prev) => (prev === 'community' ? null : 'community'))}
          aria-expanded={openDropdown === 'community'}
          aria-controls="nav-community-menu"
        >
          <span>Comunidade</span>
          <span className="nav-dropdown-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="nav-community-menu"
          className={`nav-dropdown-menu ${openDropdown === 'community' ? 'open' : ''}`}
        >
          <Link
            className="nav-dropdown-item"
            href="/comunidade"
            onClick={() => setOpenDropdown(null)}
          >
            <span className="nav-dropdown-item-label">Clubes e Conversas</span>
            <span className="nav-dropdown-item-desc">Clubes de leitura, chats e debates</span>
          </Link>
          <Link
            className="nav-dropdown-item"
            href="/calendario"
            onClick={() => setOpenDropdown(null)}
          >
            <span className="nav-dropdown-item-label">Encontros</span>
            <span className="nav-dropdown-item-desc">Agenda de conversas por livro e clube</span>
          </Link>
          <Link
            className="nav-dropdown-item"
            href="/votacao"
            onClick={() => setOpenDropdown(null)}
          >
            <span className="nav-dropdown-item-label">Votação</span>
            <span className="nav-dropdown-item-desc">Escolha da próxima leitura</span>
          </Link>
        </div>
      </div>

      {/* Menu Pessoal quando autenticado ou Link Direto quando visitante */}
      {signedIn ? (
        <div className="nav-dropdown" onBlur={handleDropdownBlur}>
          <button
            type="button"
            className={`nav-dropdown-trigger ${isPersonalActive ? 'active' : ''}`}
            onClick={() => setOpenDropdown((prev) => (prev === 'personal' ? null : 'personal'))}
            aria-expanded={openDropdown === 'personal'}
            aria-controls="nav-personal-menu"
          >
            <span>Meu ritmo</span>
            <span className="nav-dropdown-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="nav-personal-menu"
            className={`nav-dropdown-menu ${openDropdown === 'personal' ? 'open' : ''}`}
          >
            <Link
              className="nav-dropdown-item"
              href="/historico"
              onClick={() => setOpenDropdown(null)}
            >
              <span className="nav-dropdown-item-label">Histórico de leitura</span>
              <span className="nav-dropdown-item-desc">Livros em leitura, lidos e capítulos</span>
            </Link>
            <Link
              className="nav-dropdown-item"
              href="/diario"
              onClick={() => setOpenDropdown(null)}
            >
              <span className="nav-dropdown-item-label">Diário</span>
              <span className="nav-dropdown-item-desc">Suas anotações privadas</span>
            </Link>
            <Link
              className="nav-dropdown-item"
              href="/metas"
              onClick={() => setOpenDropdown(null)}
            >
              <span className="nav-dropdown-item-label">Metas anuais</span>
              <span className="nav-dropdown-item-desc">Acompanhe seus objetivos</span>
            </Link>
            <Link
              className="nav-dropdown-item"
              href="/minha-fila"
              onClick={() => setOpenDropdown(null)}
            >
              <span className="nav-dropdown-item-label">Minha fila</span>
              <span className="nav-dropdown-item-desc">Livros priorizados (Up Next)</span>
            </Link>
            <Link
              className="nav-dropdown-item"
              href="/listas"
              onClick={() => setOpenDropdown(null)}
            >
              <span className="nav-dropdown-item-label">Minhas listas</span>
              <span className="nav-dropdown-item-desc">Coleções e organização</span>
            </Link>
            <Link
              className="nav-dropdown-item"
              href="/ranking"
              onClick={() => setOpenDropdown(null)}
            >
              <span className="nav-dropdown-item-label">Ranking</span>
              <span className="nav-dropdown-item-desc">Leitores por XP e livros mais lidos</span>
            </Link>
          </div>
        </div>
      ) : (
        <Link className={isJournalActive ? 'active' : ''} href="/diario">
          Diário
        </Link>
      )}
    </nav>
  );
}
