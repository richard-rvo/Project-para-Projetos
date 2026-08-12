import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import ThemeToggle from './ThemeToggle';
import { Search, Bell } from 'lucide-react';

export default function Header() {
  const { state } = useContext(AppContext);

  const pageTitles = {
    pageGantt: 'Gráfico Gantt',
    pageSCurve: 'Curva S & Avanço',
    pageTaskList: 'Lista de Tarefas',
    pageProjects: 'Painel de Projetos',
    pageSettings: 'Configurações & Dados',
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="header-page-title">{pageTitles[state.activePage] || 'Gantt Dinâmico'}</h1>
      </div>
      <div className="header-right">
        <div className="header-search">
          <Search size={16} />
          <input type="text" placeholder="Buscar..." className="search-input" />
        </div>
        <button className="btn-icon-only" title="Notificações">
          <Bell size={18} />
        </button>
        <ThemeToggle />
        <div className="header-avatar" title="Usuário">
          <span>U</span>
        </div>
      </div>
    </header>
  );
}
