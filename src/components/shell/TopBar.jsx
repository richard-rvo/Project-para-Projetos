import React, { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronLeft,
  ChevronsUpDown,
  Search,
  Bell,
  LayoutPanelLeft,
  GanttChartSquare,
  Columns3,
  TrendingUp,
  ListChecks,
  AlertTriangle,
  Check,
} from 'lucide-react';

export const PROJECT_VIEWS = [
  { id: 'overview', icon: LayoutPanelLeft, label: 'Visão Geral' },
  { id: 'gantt', icon: GanttChartSquare, label: 'Gantt' },
  { id: 'kanban', icon: Columns3, label: 'Quadro' },
  { id: 'scurve', icon: TrendingUp, label: 'Curva S' },
  { id: 'tasklist', icon: ListChecks, label: 'Tarefas' },
  { id: 'anomalies', icon: AlertTriangle, label: 'Anomalias', badge: true },
];

const GLOBAL_TITLES = {
  pagePortfolio: 'Portfólio',
  pageAnomalies: 'Anomalias',
  pageReports: 'Relatórios',
  pageSettings: 'Configurações',
};

/**
 * A ÚNICA barra de contexto do app.
 *
 * Antes o mesmo contexto aparecia três vezes: breadcrumb no header,
 * tab bar do workspace e um <h2> na toolbar da página. Aqui é uma
 * linha só — identidade à esquerda, views no centro, busca à direita.
 */
export default function TopBar() {
  const { state, selectProject, setProjectTab, toggleCommandPalette } =
    useContext(AppContext);

  const insideProject = state.activePage === 'pageProjectWorkspace';
  const project = state.projects.find((p) => p.id === state.activeProjectId);

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3">
      {insideProject && project ? (
        <ProjectIdentity
          project={project}
          projects={state.projects}
          onSelect={selectProject}
        />
      ) : (
        <h1 className="shrink-0 pl-2 text-[17px] font-semibold tracking-tight text-text-1">
          {GLOBAL_TITLES[state.activePage] || 'Projeta'}
        </h1>
      )}

      {insideProject && project && (
        <ViewSegments
          active={state.activeProjectTab || 'overview'}
          onChange={setProjectTab}
          anomalyCount={
            state.anomalies.filter(
              (a) => a.projectId === state.activeProjectId && a.status === 'aberta'
            ).length
          }
        />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggleCommandPalette(true)}
          className={cn(
            'flex h-8 items-center gap-2 rounded-[6px] border border-line px-2.5',
            'text-small text-text-3 transition-colors duration-100',
            'hover:border-line-strong hover:text-text-2'
          )}
        >
          <Search size={14} strokeWidth={1.8} />
          <span className="hidden sm:inline">Pesquisar</span>
          <kbd className="hidden rounded-[4px] bg-surface-3 px-1.5 py-0.5 text-micro font-medium text-text-3 sm:inline">
            ⌘K
          </kbd>
        </button>

        <NotificationsBell
          count={state.anomalies.filter((a) => a.status === 'aberta').length}
        />
      </div>
    </header>
  );
}

/* ── Identidade do projeto + troca rápida ────────────────────────── */

function ProjectIdentity({ project, projects, onSelect }) {
  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        title="Voltar ao portfólio"
        className="grid size-8 shrink-0 place-items-center rounded-[6px] text-text-3 transition-colors duration-100 hover:bg-surface-3 hover:text-text-1"
      >
        <ChevronLeft size={18} strokeWidth={1.8} />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-8 min-w-0 items-center gap-1.5 rounded-[6px] px-2',
              'transition-colors duration-100 hover:bg-surface-3'
            )}
          >
            <span className="truncate text-[15px] font-semibold tracking-tight text-text-1">
              {project.name}
            </span>
            <ChevronsUpDown size={14} strokeWidth={1.8} className="shrink-0 text-text-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
            Trocar de projeto
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => onSelect(p.id)}
              className="gap-2"
            >
              <Check
                size={14}
                className={cn('shrink-0', p.id === project.id ? 'opacity-100' : 'opacity-0')}
              />
              <span className="truncate">{p.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ── Segmented control das views ─────────────────────────────────── */

function ViewSegments({ active, onChange, anomalyCount }) {
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-[8px] bg-surface-3 p-0.5">
      {PROJECT_VIEWS.map((view) => {
        const Icon = view.icon;
        const isActive = active === view.id;
        const showBadge = view.badge && anomalyCount > 0;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onChange(view.id)}
            aria-pressed={isActive}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5',
              'text-small font-medium transition-all duration-100',
              isActive
                ? 'bg-surface-1 text-text-1 shadow-elev-1'
                : 'text-text-2 hover:text-text-1'
            )}
          >
            <Icon size={14} strokeWidth={1.9} />
            <span className="whitespace-nowrap">{view.label}</span>
            {showBadge && (
              <span className="ml-0.5 rounded-full bg-sched-late-soft px-1.5 text-micro font-semibold tabular-nums text-sched-late">
                {anomalyCount > 99 ? '99+' : anomalyCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Sino ────────────────────────────────────────────────────────── */

function NotificationsBell({ count }) {
  return (
    <button
      type="button"
      title="Notificações"
      className="relative grid size-8 place-items-center rounded-[6px] text-text-2 transition-colors duration-100 hover:bg-surface-3 hover:text-text-1"
    >
      <Bell size={17} strokeWidth={1.8} />
      {count > 0 && (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-sched-late ring-2 ring-surface-1" />
      )}
    </button>
  );
}
