import React, { useContext, useState, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Search,
  Folder,
  CheckSquare,
  AlertTriangle,
  LayoutGrid,
  BarChart2,
  TrendingUp,
  FileText,
  Settings,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function CommandPalette() {
  const { state, toggleCommandPalette, selectProject, setProjectTab, navigate, openTaskInspector } = useContext(AppContext);
  const { isCommandPaletteOpen, projects, tasks, anomalies, activeProjectId } = state;
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  // Global hotkey handler (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        toggleCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, toggleCommandPalette]);

  if (!isCommandPaletteOpen) return null;

  const q = query.trim().toLowerCase();

  // Navigation Items
  const navItems = [
    { label: 'Ir para Dashboard Executivo', page: 'pageDashboard', icon: LayoutGrid },
    { label: 'Ir para Lista de Projetos', page: 'pageProjects', icon: Folder },
    { label: 'Ir para Central de Anomalias', page: 'pageAnomalies', icon: AlertTriangle },
    { label: 'Ir para Relatórios Executivos', page: 'pageReports', icon: FileText },
    { label: 'Ir para Configurações do Sistema', page: 'pageSettings', icon: Settings },
  ].filter((item) => !q || item.label.toLowerCase().includes(q));

  // Projects Filtered
  const filteredProjects = projects.filter((p) => !q || p.name.toLowerCase().includes(q));

  // Tasks Filtered
  const filteredTasks = tasks
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .slice(0, 5);

  // Anomalies Filtered
  const filteredAnomalies = anomalies
    .filter((a) => !q || a.title.toLowerCase().includes(q))
    .slice(0, 5);

  const handleSelectNav = (page) => {
    navigate(page);
    toggleCommandPalette(false);
  };

  const handleSelectProject = (projId, tab = 'overview') => {
    selectProject(projId);
    setProjectTab(tab);
    toggleCommandPalette(false);
  };

  const handleSelectTask = (task) => {
    selectProject(task.projectId);
    setProjectTab('gantt');
    openTaskInspector(task.id);
    toggleCommandPalette(false);
  };

  const handleSelectAnomaly = (anom) => {
    selectProject(anom.projectId);
    setProjectTab('anomalies');
    toggleCommandPalette(false);
  };

  return (
    <div className="command-palette-overlay" onClick={() => toggleCommandPalette(false)}>
      <div className="command-palette-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search input header */}
        <div className="command-palette-search">
          <Search size={20} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Pesquisar projetos, tarefas, anomalias ou comandos (⌘K)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="command-palette-kbd">ESC</kbd>
        </div>

        {/* Results Body */}
        <div className="command-palette-results">
          {/* Global Navigation */}
          {navItems.length > 0 && (
            <div className="command-group">
              <div className="command-group-title">Navegação</div>
              {navItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="command-item"
                    onClick={() => handleSelectNav(item.page)}
                  >
                    <Icon size={16} className="command-item-icon" />
                    <span>{item.label}</span>
                    <ArrowRight size={14} className="command-arrow" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Projects Group */}
          {filteredProjects.length > 0 && (
            <div className="command-group">
              <div className="command-group-title">Projetos</div>
              {filteredProjects.map((p) => (
                <div
                  key={p.id}
                  className="command-item"
                  onClick={() => handleSelectProject(p.id)}
                >
                  <Folder size={16} className="command-item-icon text-primary" />
                  <div className="command-item-content">
                    <span className="command-item-title">{p.name}</span>
                    <span className="command-item-subtitle">{p.code || 'Projeto'} • {p.status || 'Em andamento'}</span>
                  </div>
                  <ArrowRight size={14} className="command-arrow" />
                </div>
              ))}
            </div>
          )}

          {/* Tasks Group */}
          {filteredTasks.length > 0 && (
            <div className="command-group">
              <div className="command-group-title">Tarefas</div>
              {filteredTasks.map((t) => (
                <div
                  key={t.id}
                  className="command-item"
                  onClick={() => handleSelectTask(t)}
                >
                  <CheckSquare size={16} className="command-item-icon text-blue" />
                  <div className="command-item-content">
                    <span className="command-item-title">{t.name}</span>
                    <span className="command-item-subtitle">Progresso: {t.progress || 0}% • Duração: {t.duration || 1}d</span>
                  </div>
                  <ArrowRight size={14} className="command-arrow" />
                </div>
              ))}
            </div>
          )}

          {/* Anomalies Group */}
          {filteredAnomalies.length > 0 && (
            <div className="command-group">
              <div className="command-group-title">Anomalias</div>
              {filteredAnomalies.map((a) => (
                <div
                  key={a.id}
                  className="command-item"
                  onClick={() => handleSelectAnomaly(a)}
                >
                  <AlertTriangle size={16} className="command-item-icon text-amber" />
                  <div className="command-item-content">
                    <span className="command-item-title">{a.title}</span>
                    <span className="command-item-subtitle">Severidade: {a.severity} • Status: {a.status}</span>
                  </div>
                  <ArrowRight size={14} className="command-arrow" />
                </div>
              ))}
            </div>
          )}

          {navItems.length === 0 && filteredProjects.length === 0 && filteredTasks.length === 0 && filteredAnomalies.length === 0 && (
            <div className="command-empty">
              <Sparkles size={24} />
              <p>Nenhum resultado encontrado para "{query}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
