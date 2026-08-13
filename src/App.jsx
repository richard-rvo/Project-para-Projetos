import React, { useContext, useEffect } from 'react';
import { AppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import TaskInspectorDrawer from './components/TaskInspectorDrawer';
import CommandPalette from './components/CommandPalette';
import ProjectWorkspace from './components/ProjectWorkspace';
import PageDashboard from './pages/PageDashboard';
import PageProjects from './pages/PageProjects';
import PageAnomalies from './pages/PageAnomalies';
import PageReports from './pages/PageReports';
import PageSettings from './pages/PageSettings';

function App() {
  const { state } = useContext(AppContext);

  const renderPage = () => {
    switch (state.activePage) {
      case 'pageDashboard':
        return <PageDashboard />;
      case 'pageProjects':
        return <PageProjects />;
      case 'pageProjectWorkspace':
        return <ProjectWorkspace />;
      case 'pageAnomalies':
        return <PageAnomalies />;
      case 'pageReports':
        return <PageReports />;
      case 'pageSettings':
        return <PageSettings />;
      default:
        return <PageProjects />;
    }
  };

  return (
    <div className={`app-shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} data-theme={state.theme}>
      <Sidebar />
      <div className="app-main-content">
        <Header />
        <main className="page-container">{renderPage()}</main>
      </div>
      <TaskInspectorDrawer />
      <CommandPalette />
      <Toast />
    </div>
  );
}

export default App;
