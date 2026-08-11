import React from 'react';
import { Lucide } from 'lucide-react';

function Sidebar() {
  return (
    <aside className="app-sidebar" id="appSidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="brand-logo-badge">
            <Lucide name="layout-grid" size={20} />
          </div>
          <div className="logo-title-group">
            <span className="logo-title">PRIORITY TASKS</span>
            <span className="logo-subtitle">GTP - COQUERIA</span>
          </div>
        </div>
      </div>
      <nav className="sidebar-menu">
        <div className="menu-group-label">NAVEGAÇÃO PRINCIPAL</div>
        <button className="nav-item active" data-page="pageGantt" id="navGantt">
          <Lucide name="bar-chart-2" size={18} />
          <span>Gráfico Gantt</span>
        </button>
        <button className="nav-item" data-page="pageSCurve" id="navSCurve">
          <Lucide name="trending-up" size={18} />
          <span>Curva S & Avanço</span>
        </button>
        <button className="nav-item" data-page="pageTaskList" id="navTaskList">
          <Lucide name="check-square" size={18} />
          <span>Lista de Tarefas</span>
        </button>
        <button className="nav-item" data-page="pageProjects" id="navProjects">
          <Lucide name="folder-kanban" size={18} />
          <span>Painel de Projetos</span>
        </button>
        <div className="menu-group-label" style={{ marginTop: '20px' }}>SISTEMA & DADOS</div>
        <button className="nav-item" data-page="pageSettings" id="navSettings">
          <Lucide name="settings" size={18} />
          <span>Configurações & Dados</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <button className="btn-sidebar-collapse" id="btnToggleSidebar" title="Recolher / Expandir Sidebar">
          <Lucide name="panel-left-close" size={16} />
          <span>Recolher Menu</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
