import React, { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import PageGantt from './pages/PageGantt.jsx';
import PageSCurve from './pages/PageSCurve.jsx';
import PageTaskList from './pages/PageTaskList.jsx';
import PageProjects from './pages/PageProjects.jsx';
import PageSettings from './pages/PageSettings.jsx';

function App() {
  const [activePage, setActivePage] = useState('pageGantt');

  const renderPage = () => {
    switch (activePage) {
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
        return <PageGantt />;
    }
  };

  const handleNavClick = (e) => {
    const btn = e.target.closest('button');
    const page = btn?.dataset.page;
    if (page) setActivePage(page);
  };

  return (
    <div className="app-shell" onClick={handleNavClick}>
      <Sidebar />
      <div className="app-main-content">
        <Header />
        <main className="page-container">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
