import React, { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  AlertTriangle,
  FileBarChart,
  Settings,
  UserCircle2,
  Sun,
  Moon,
  Pin,
  PinOff,
  Rows3,
  Rows4,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'pagePortfolio', icon: LayoutGrid, label: 'Portfólio' },
  { id: 'pageAnomalies', icon: AlertTriangle, label: 'Anomalias', badge: 'anomalies' },
  { id: 'pageReports', icon: FileBarChart, label: 'Relatórios' },
  { id: 'pageSettings', icon: Settings, label: 'Configurações' },
];

const RAIL_W = 64;
const RAIL_W_OPEN = 232;

/**
 * Trilho de navegação global.
 *
 * Fica em 64px e SOBREPÕE o conteúdo ao expandir, em vez de empurrá-lo:
 * reflow a cada passada de mouse é exatamente o tipo de instabilidade
 * que a referência Apple não tem. Fixar o trilho reserva a largura de
 * verdade no layout.
 */
export default function AppRail() {
  const { state, navigate, toggleRailPinned, setDensity, setTheme } =
    useContext(AppContext);
  const [hovered, setHovered] = useState(false);

  const pinned = state.railPinned;
  const open = pinned || hovered;

  const openAnomalies = state.anomalies.filter((a) => a.status === 'aberta').length;
  const isDark = state.theme === 'dark';
  const isCompact = state.density === 'compact';

  /* Dentro de um projeto nenhum item global fica aceso — o contexto
     está no TopBar, não aqui. */
  const activeId =
    state.activePage === 'pageProjectWorkspace' ? null : state.activePage;

  const badgeFor = (key) => (key === 'anomalies' ? openAnomalies : 0);

  return (
    <div
      className="relative shrink-0 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: pinned ? RAIL_W_OPEN : RAIL_W }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <aside
        className={cn(
          'absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden',
          'border-r border-line bg-surface-1',
          'transition-[width,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]'
        )}
        style={{
          width: open ? RAIL_W_OPEN : RAIL_W,
          boxShadow: open && !pinned ? 'var(--elev-3)' : 'none',
        }}
      >
        {/* ── Marca ────────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center gap-3 px-4">
          <img
            src="/logo.png"
            alt=""
            className="size-8 shrink-0 rounded-[6px] object-contain"
          />
          <span
            className={cn(
              'whitespace-nowrap text-[15px] font-semibold tracking-tight text-text-1',
              'transition-opacity duration-150',
              open ? 'opacity-100' : 'opacity-0'
            )}
          >
            Projeta
          </span>
        </div>

        {/* ── Navegação ────────────────────────────────────────── */}
        <nav className="flex flex-col gap-0.5 px-3 pt-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeId === item.id;
            const badge = badgeFor(item.badge);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 items-center gap-3 rounded-[6px] px-2.5',
                  'text-left transition-colors duration-100',
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-text-2 hover:bg-surface-3 hover:text-text-1'
                )}
              >
                <span className="relative grid size-5 shrink-0 place-items-center">
                  <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                  {/* Colapsado, o badge vira um ponto sobre o ícone */}
                  {badge > 0 && !open && (
                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-sched-late ring-2 ring-surface-1" />
                  )}
                </span>
                <span
                  className={cn(
                    'flex-1 whitespace-nowrap text-body font-medium',
                    'transition-opacity duration-150',
                    open ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {item.label}
                </span>
                {badge > 0 && open && (
                  <span className="rounded-full bg-sched-late-soft px-1.5 py-0.5 text-micro font-semibold tabular-nums text-sched-late">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* ── Preferências ─────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5 border-t border-line px-3 py-2">
          <RailAction
            open={open}
            icon={isCompact ? Rows4 : Rows3}
            label={isCompact ? 'Densidade: compacta' : 'Densidade: confortável'}
            onClick={() => setDensity(isCompact ? 'comfortable' : 'compact')}
          />
          <RailAction
            open={open}
            icon={isDark ? Sun : Moon}
            label={isDark ? 'Tema claro' : 'Tema escuro'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          />
          <RailAction
            open={open}
            icon={pinned ? PinOff : Pin}
            label={pinned ? 'Soltar menu' : 'Fixar menu'}
            onClick={toggleRailPinned}
          />
        </div>

        {/* ── Perfil ───────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-t border-line px-4">
          <UserCircle2 size={24} strokeWidth={1.6} className="shrink-0 text-text-3" />
          <div
            className={cn(
              'flex min-w-0 flex-col transition-opacity duration-150',
              open ? 'opacity-100' : 'opacity-0'
            )}
          >
            <span className="truncate text-small font-medium text-text-1">
              Meu Perfil
            </span>
            <span className="truncate text-micro text-text-3">Usuário</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function RailAction({ open, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? undefined : label}
      className={cn(
        'flex h-9 items-center gap-3 rounded-[6px] px-2.5 text-left',
        'text-text-2 transition-colors duration-100 hover:bg-surface-3 hover:text-text-1'
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center">
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <span
        className={cn(
          'whitespace-nowrap text-small transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0'
        )}
      >
        {label}
      </span>
    </button>
  );
}
