import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { PageScroll } from '../App';
import PageProjectOverview from '../pages/PageProjectOverview';
import PageGantt from '../pages/PageGantt';
import PageKanban from '../pages/PageKanban';
import PageSCurve from '../pages/PageSCurve';
import PageTaskList from '../pages/PageTaskList';
import PageProjectAnomalies from '../pages/PageProjectAnomalies';

/**
 * Roteador de views do projeto.
 *
 * A tab bar que morava aqui foi absorvida pelo TopBar — era a terceira
 * cópia do mesmo contexto na tela.
 *
 * O Gantt é o único que renderiza sem contêiner de rolagem: ele ocupa
 * a altura inteira e administra o próprio scroll.
 */
export default function ProjectWorkspace() {
  const { state } = useContext(AppContext);
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  if (!activeProject) return null;

  switch (state.activeProjectTab || 'overview') {
    case 'gantt':
      return <PageGantt />;
    case 'kanban':
      return <PageScroll><PageKanban /></PageScroll>;
    case 'scurve':
      return <PageScroll><PageSCurve /></PageScroll>;
    case 'tasklist':
      return <PageScroll><PageTaskList /></PageScroll>;
    case 'anomalies':
      return <PageScroll><PageProjectAnomalies /></PageScroll>;
    case 'overview':
    default:
      return <PageScroll><PageProjectOverview /></PageScroll>;
  }
}
