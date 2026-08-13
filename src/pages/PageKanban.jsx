import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { today, addDays } from '../utils/schedule';
import {
  Plus,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Flag,
  Calendar,
  MoreHorizontal,
  Link2,
} from 'lucide-react';
import ProgressBar from '../components/ProgressBar';

const COLUMNS = [
  { id: 'a_fazer', label: 'A Fazer', color: '#f59e0b', lightBg: 'rgba(245, 158, 11, 0.08)' },
  { id: 'em_andamento', label: 'Em Andamento', color: '#3b82f6', lightBg: 'rgba(59, 130, 246, 0.08)' },
  { id: 'em_revisao', label: 'Em Revisão', color: '#a855f7', lightBg: 'rgba(168, 85, 247, 0.08)' },
  { id: 'concluido', label: 'Concluído', color: '#10b981', lightBg: 'rgba(16, 185, 129, 0.08)' },
];

export default function PageKanban() {
  const { state, updateTask, addTask, openTaskInspector, showToast } = useContext(AppContext);
  const { tasks, activeProjectId, anomalies } = state;

  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [addingToCol, setAddingToCol] = useState(null);
  const [newTaskName, setNewTaskName] = useState('');

  // Drag Handlers
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', String(taskId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    const taskIdStr = e.dataTransfer.getData('text/plain') || draggedTaskId;
    const taskId = Number(taskIdStr);
    if (!taskId) return;

    const task = projectTasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.status === targetStatus) return;

    let newProgress = task.progress;
    if (targetStatus === 'concluido') newProgress = 100;
    else if (targetStatus === 'a_fazer') newProgress = 0;
    else if (targetStatus === 'em_andamento' && task.progress === 0) newProgress = 50;

    const updated = {
      ...task,
      status: targetStatus,
      progress: newProgress,
    };

    await updateTask(updated);
    showToast(`Tarefa movida para "${COLUMNS.find((c) => c.id === targetStatus)?.label}"`, 'info');
    setDraggedTaskId(null);
  };

  // Inline Quick Add Task
  const handleQuickAdd = async (colId) => {
    if (!newTaskName.trim()) {
      setAddingToCol(null);
      return;
    }

    const todayStr = today();
    const endStr = addDays(todayStr, 5);

    const newTask = {
      projectId: activeProjectId,
      name: newTaskName.trim(),
      status: colId,
      progress: colId === 'concluido' ? 100 : colId === 'em_andamento' ? 25 : 0,
      duration: 5,
      startDate: todayStr,
      endDate: endStr,
      resource: '',
      predecessors: '',
    };

    await addTask(newTask);
    showToast('Tarefa criada no quadro!', 'success');
    setNewTaskName('');
    setAddingToCol(null);
  };

  return (
    <div className="kanban-container">
      {/* Columns Grid */}
      <div className="kanban-grid">
        {COLUMNS.map((col) => {
          const colTasks = projectTasks.filter((t) => {
            const status = t.status || (t.progress === 100 ? 'concluido' : t.progress > 0 ? 'em_andamento' : 'a_fazer');
            return status === col.id;
          });

          return (
            <div
              key={col.id}
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column Header */}
              <div className="kanban-column-header" style={{ '--col-accent': col.color }}>
                <div className="kanban-column-title">
                  <span className="kanban-column-dot" style={{ backgroundColor: col.color }} />
                  <h3>{col.label}</h3>
                  <span className="kanban-count-pill">{colTasks.length}</span>
                </div>
                <button
                  className="btn-icon-sm"
                  onClick={() => setAddingToCol(col.id)}
                  title={`Adicionar tarefa em ${col.label}`}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Inline Add Task Input */}
              {addingToCol === col.id && (
                <div className="kanban-add-card">
                  <input
                    type="text"
                    className="kanban-add-input"
                    placeholder="Nome da tarefa..."
                    value={newTaskName}
                    autoFocus
                    onChange={(e) => setNewTaskName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleQuickAdd(col.id);
                      if (e.key === 'Escape') setAddingToCol(null);
                    }}
                  />
                  <div className="kanban-add-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => handleQuickAdd(col.id)}>
                      Adicionar
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setAddingToCol(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Tasks List */}
              <div className="kanban-cards-list">
                {colTasks.map((t) => {
                  const taskAnoms = anomalies.filter((a) => a.taskId === t.id && a.status === 'aberta');

                  return (
                    <div
                      key={t.id}
                      className={`kanban-card ${t.isMilestone ? 'is-milestone' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, t.id)}
                      onClick={() => openTaskInspector(t.id)}
                    >
                      {/* Top Bar */}
                      <div className="kanban-card-top">
                        <span className="kanban-card-id">#{t.id}</span>
                        {t.isMilestone && (
                          <span className="kanban-milestone-tag">
                            <Flag size={12} /> Marco
                          </span>
                        )}
                        {taskAnoms.length > 0 && (
                          <span className="kanban-anomaly-tag" title={`${taskAnoms.length} anomalia(s) aberta(s)`}>
                            <AlertTriangle size={12} /> {taskAnoms.length}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="kanban-card-title">{t.name}</h4>

                      {/* Progress */}
                      <div className="kanban-card-progress">
                        <ProgressBar value={t.progress || 0} />
                        <span className="kanban-progress-pct">{t.progress || 0}%</span>
                      </div>

                      {/* Footer Meta */}
                      <div className="kanban-card-footer">
                        {t.endDate && (
                          <div className="kanban-meta-item" title="Data limite">
                            <Calendar size={13} />
                            <span>{t.endDate.slice(8, 10)}/{t.endDate.slice(5, 7)}</span>
                          </div>
                        )}
                        {t.predecessors && (
                          <div className="kanban-meta-item" title={`Predecessoras: ${t.predecessors}`}>
                            <Link2 size={13} />
                            <span>{t.predecessors}</span>
                          </div>
                        )}
                        {t.resource && (
                          <div className="kanban-avatar" title={`Responsável: ${t.resource}`}>
                            <User size={12} />
                            <span>{t.resource.split(' ')[0]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && addingToCol !== col.id && (
                  <div className="kanban-column-empty">
                    <p>Nenhuma tarefa aqui</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
