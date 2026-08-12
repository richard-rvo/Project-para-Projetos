import React, { useContext, useEffect } from 'react';
import { AppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import PageGantt from './pages/PageGantt';
import PageSCurve from './pages/PageSCurve';
import PageTaskList from './pages/PageTaskList';
import PageProjects from './pages/PageProjects';
import PageSettings from './pages/PageSettings';
import { getAllTasks } from './utils/storage';

function App() {
  const { state, dispatch, ACTIONS } = useContext(AppContext);

  /* Load all tasks on mount */
  useEffect(() => {
    (async () => {
      const tasks = await getAllTasks();
      dispatch({ type: ACTIONS.SET_TASKS, payload: tasks });
    })();
  }, []);

  const renderPage = () => {
    switch (state.activePage) {
      case 'pageGantt':
        return <PageGantt />;
      case 'pageSCurve':
        return <PageSCurve />;
      case 'pageTaskList':
        return <PageTaskList />;
      case 'pageProjects':
        return <PageProjects />;
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
      <Toast />
    </div>
  );
}

export default App;
