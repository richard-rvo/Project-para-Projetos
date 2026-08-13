import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import {
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  FileBarChart,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'pageDashboard',  icon: LayoutDashboard, label: 'Dashboard'         },
  { id: 'pageProjects',   icon: FolderKanban,    label: 'Projetos'          },
  { id: 'pageAnomalies',  icon: AlertTriangle,   label: 'Anomalias'         },
  { id: 'pageReports',    icon: FileBarChart,    label: 'Relatórios'        },
];

const SYSTEM_ITEMS = [
  { id: 'pageSettings',   icon: Settings,        label: 'Configurações'     },
];

export default function Sidebar() {
  const { state, dispatch, ACTIONS, navigate } = useContext(AppContext);
  const collapsed = state.sidebarCollapsed;

  /* Determine the "active" item for highlighting.
     When inside a project workspace, no global nav item is highlighted. */
  const activePage = state.activePage === 'pageProjectWorkspace' ? '' : state.activePage;

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
              <span className="logo-title">PROJETA</span>
              <span className="logo-subtitle">Gestão de Projetos</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-menu">
        {!collapsed && <div className="menu-group-label">NAVEGAÇÃO</div>}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {!collapsed && <div className="menu-group-label" style={{ marginTop: '20px' }}>SISTEMA</div>}
        {SYSTEM_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User profile section */}
      <div className="sidebar-profile">
        <div className="profile-avatar-sm">
          <UserCircle size={collapsed ? 22 : 32} />
        </div>
        {!collapsed && (
          <div className="profile-info">
            <span className="profile-name">Meu Perfil</span>
            <span className="profile-role">Usuário</span>
          </div>
        )}
      </div>

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
