import React, { useContext } from 'react';
import { AppContext } from './context/AppContext';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import AppRail from './components/shell/AppRail';
import TopBar from './components/shell/TopBar';
import Toast from './components/Toast';
import TaskInspectorDrawer from './components/TaskInspectorDrawer';
import CommandPalette from './components/CommandPalette';
import ProjectWorkspace from './components/ProjectWorkspace';
import PagePortfolio from './pages/PagePortfolio';
import PageAnomalies from './pages/PageAnomalies';
import PageReports from './pages/PageReports';
import PageSettings from './pages/PageSettings';

/**
 * Contêiner de rolagem para views que são documentos, não superfícies.
 * O Gantt NÃO usa isto: ele preenche a altura e rola por dentro.
 */
export function PageScroll({ children }) {
  return <div className="h-full overflow-auto p-5">{children}</div>;
}

function App() {
  const { state } = useContext(AppContext);
  useGlobalShortcuts();

  const renderPage = () => {
    switch (state.activePage) {
      case 'pageProjectWorkspace':
        return <ProjectWorkspace />;
      case 'pageAnomalies':
        return <PageScroll><PageAnomalies /></PageScroll>;
      case 'pageReports':
        return <PageScroll><PageReports /></PageScroll>;
      case 'pageSettings':
        return <PageScroll><PageSettings /></PageScroll>;
      case 'pagePortfolio':
      default:
        return <PagePortfolio />;
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-surface-0">
      <AppRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-hidden">{renderPage()}</main>
      </div>
      <TaskInspectorDrawer />
      <CommandPalette />
      <Toast />
    </div>
  );
}

export default App;
