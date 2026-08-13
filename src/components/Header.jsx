import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import ThemeToggle from './ThemeToggle';
import { Bell, ChevronRight, ChevronDown, Search } from 'lucide-react';

export default function Header() {
  const { state, selectProject, setProjectTab, toggleCommandPalette } = useContext(AppContext);

  /* ── Breadcrumb logic ───────────────────────────────────────── */
  const isInsideProject = state.activePage === 'pageProjectWorkspace';
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const pageTitles = {
    pageDashboard:        'Dashboard',
    pageProjects:         'Projetos',
    pageAnomalies:        'Anomalias',
    pageReports:          'Relatórios',
    pageSettings:         'Configurações & Dados',
    pageProjectWorkspace: activeProject?.name || 'Projeto',
  };

  const TAB_LABELS = {
    overview:  'Visão Geral',
    gantt:     'Gantt',
    kanban:    'Quadro',
    scurve:    'Curva S',
    tasklist:  'Tarefas',
    anomalies: 'Anomalias',
  };

  /* Anomaly badge count for active project */
  const openAnomaliesCount = state.anomalies.filter(
    (a) => a.projectId === state.activeProjectId && a.status === 'aberta'
  ).length;

  return (
    <header className="app-header">
      <div className="header-left">
        {isInsideProject ? (
          /* Breadcrumb: Projetos > Nome do Projeto > Tab Ativa */
          <nav className="header-breadcrumb" aria-label="breadcrumb">
            <button
              className="breadcrumb-item breadcrumb-link"
              onClick={() => selectProject(null)}
            >
              Projetos
            </button>
            <ChevronRight size={14} className="breadcrumb-sep" />
            <span className="breadcrumb-item breadcrumb-current">
              {activeProject?.name || 'Projeto'}
            </span>
            <ChevronRight size={14} className="breadcrumb-sep" />
            <span className="breadcrumb-item breadcrumb-tab">
              {TAB_LABELS[state.activeProjectTab] || state.activeProjectTab}
            </span>
          </nav>
        ) : (
          <h1 className="header-page-title">
            {pageTitles[state.activePage] || 'Projeta'}
          </h1>
        )}
      </div>

      <div className="header-right">
        {/* Apple Spotlight Command Palette Button */}
        <button
          className="header-command-btn"
          onClick={() => toggleCommandPalette(true)}
          title="Buscar (⌘K)"
        >
          <Search size={14} />
          <span>Pesquisar...</span>
          <kbd className="command-kbd">⌘K</kbd>
        </button>

        {/* Quick project switcher when inside a project */}
        {isInsideProject && state.projects.length > 1 && (
          <div className="header-project-switcher">
            <select
              className="project-switcher-select"
              value={state.activeProjectId || ''}
              onChange={(e) => {
                const id = e.target.value;
                if (id) selectProject(id);
              }}
              title="Trocar projeto"
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="project-switcher-arrow" />
          </div>
        )}
        <button className="btn-icon-only" title="Notificações" style={{ position: 'relative' }}>
          <Bell size={18} />
          {openAnomaliesCount > 0 && (
            <span className="notif-badge">{openAnomaliesCount > 9 ? '9+' : openAnomaliesCount}</span>
          )}
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
