import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import {
  BarChart2,
  TrendingUp,
  CheckSquare,
  FolderKanban,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'pageProjects', icon: FolderKanban, label: 'Painel de Projetos' },
  { id: 'pageGantt', icon: BarChart2, label: 'Gráfico Gantt' },
  { id: 'pageSCurve', icon: TrendingUp, label: 'Curva S & Avanço' },
  { id: 'pageTaskList', icon: CheckSquare, label: 'Lista de Tarefas' },
];

const SYSTEM_ITEMS = [
  { id: 'pageSettings', icon: Settings, label: 'Configurações & Dados' },
];

export default function Sidebar() {
  const { state, dispatch, ACTIONS, navigate } = useContext(AppContext);
  const collapsed = state.sidebarCollapsed;

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`} id="appSidebar">
      {/* Brand */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="brand-logo-badge" style={{ background: 'transparent', padding: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
          {!collapsed && (
            <div className="logo-title-group">
              <span className="logo-title">GANTT DINÂMICO</span>
              <span className="logo-subtitle">Gestão de Projetos</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-menu">
        {!collapsed && <div className="menu-group-label">NAVEGAÇÃO PRINCIPAL</div>}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${state.activePage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {!collapsed && <div className="menu-group-label" style={{ marginTop: '20px' }}>SISTEMA & DADOS</div>}
        {SYSTEM_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${state.activePage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="sidebar-footer">
        <button
          className="btn-sidebar-collapse"
          onClick={() => dispatch({ type: ACTIONS.TOGGLE_SIDEBAR })}
          title={collapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Recolher Menu</span>}
        </button>
      </div>
    </aside>
  );
}
