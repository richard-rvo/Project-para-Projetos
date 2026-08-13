import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import PageProjectOverview from '../pages/PageProjectOverview';
import PageGantt from '../pages/PageGantt';
import PageKanban from '../pages/PageKanban';
import PageSCurve from '../pages/PageSCurve';
import PageTaskList from '../pages/PageTaskList';
import PageProjectAnomalies from '../pages/PageProjectAnomalies';
import {
  LayoutGrid,
  BarChart2,
  Columns,
  TrendingUp,
  CheckSquare,
  AlertTriangle,
  ChevronLeft,
} from 'lucide-react';

const TABS = [
  { id: 'overview',  icon: LayoutGrid,    label: 'Visão Geral'  },
  { id: 'gantt',     icon: BarChart2,     label: 'Gantt'        },
  { id: 'kanban',    icon: Columns,       label: 'Quadro'       },
  { id: 'scurve',    icon: TrendingUp,    label: 'Curva S'      },
  { id: 'tasklist',  icon: CheckSquare,   label: 'Tarefas'      },
  { id: 'anomalies', icon: AlertTriangle, label: 'Anomalias'    },
];

export default function ProjectWorkspace() {
  const { state, selectProject, setProjectTab } = useContext(AppContext);
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTab = state.activeProjectTab || 'overview';

  /* Anomaly badge count */
  const openCount = state.anomalies.filter(
    (a) => a.projectId === state.activeProjectId && a.status === 'aberta'
  ).length;

  if (!activeProject) return null;

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':  return <PageProjectOverview />;
      case 'gantt':     return <PageGantt />;
      case 'kanban':    return <PageKanban />;
      case 'scurve':    return <PageSCurve />;
      case 'tasklist':  return <PageTaskList />;
      case 'anomalies': return <PageProjectAnomalies />;
      default:          return <PageProjectOverview />;
    }
  };

  return (
    <div className="project-workspace" id="projectWorkspace">
      {/* Workspace sub-header: tabs */}
      <div className="workspace-tab-bar">

        <div className="workspace-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`workspace-tab ${isActive ? 'active' : ''}`}
                onClick={() => setProjectTab(tab.id)}
                title={tab.label}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                {tab.id === 'anomalies' && openCount > 0 && (
                  <span className="tab-badge">{openCount > 9 ? '9+' : openCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="workspace-content">
        {renderTab()}
      </div>
    </div>
  );
}
