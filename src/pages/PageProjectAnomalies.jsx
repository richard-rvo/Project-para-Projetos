import React, { useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { generateId } from '../utils/ids';
import AnomalyBoard from '../components/anomalies/AnomalyBoard';

/* Anomalias do projeto ativo. Toda a interface vive em AnomalyBoard,
   compartilhada com a central global — antes eram duas telas com
   código quase igual e comportamentos levemente diferentes. */

export default function PageProjectAnomalies() {
  const { state, addAnomaly, updateAnomaly, removeAnomaly, showToast } = useContext(AppContext);
  const projectId = state.activeProjectId;

  const anomalies = useMemo(
    () => state.anomalies.filter((a) => a.projectId === projectId),
    [state.anomalies, projectId]
  );
  const tasks = useMemo(
    () => state.tasks.filter((t) => t.projectId === projectId),
    [state.tasks, projectId]
  );

  return (
    <AnomalyBoard
      anomalies={anomalies}
      tasks={tasks}
      projects={state.projects}
      onError={(msg) => showToast(msg, 'error')}
      onCreate={(data) => addAnomaly({
        ...data,
        id: generateId(),
        projectId,
        taskId: data.taskId || null,
        reportedAt: new Date().toISOString(),
        resolvedAt: data.status === 'resolvida' ? new Date().toISOString() : null,
      })}
      onUpdate={async (data) => { await updateAnomaly(data); return data; }}
      onDelete={removeAnomaly}
    />
  );
}
