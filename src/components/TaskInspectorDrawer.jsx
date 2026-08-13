import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import {
  X,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Link2,
  Trash2,
  Flag,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function TaskInspectorDrawer() {
  const { state, updateTask, removeTask, closeTaskInspector, showToast } = useContext(AppContext);
  const { inspectorTaskId, tasks, projects, anomalies } = state;

  const task = tasks.find((t) => t.id === inspectorTaskId);
  const project = task ? projects.find((p) => p.id === task.projectId) : null;
  const taskAnomalies = task ? anomalies.filter((a) => a.taskId === task.id) : [];

  const [formData, setFormData] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        ...task,
        status: task.status || (task.progress === 100 ? 'concluido' : task.progress > 0 ? 'em_andamento' : 'a_fazer'),
      });
    } else {
      setFormData(null);
    }
  }, [task]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && inspectorTaskId) {
        closeTaskInspector();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectorTaskId, closeTaskInspector]);

  if (!inspectorTaskId || !formData) return null;

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      
      // Auto-update status if progress changes
      if (field === 'progress') {
        const val = Number(value);
        if (val === 100) updated.status = 'concluido';
        else if (val > 0 && updated.status === 'a_fazer') updated.status = 'em_andamento';
      }

      // Auto-update progress if status changes
      if (field === 'status') {
        if (value === 'concluido') updated.progress = 100;
        else if (value === 'a_fazer') updated.progress = 0;
        else if (value === 'em_andamento' && updated.progress === 0) updated.progress = 50;
      }

      return updated;
    });
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    await updateTask(formData);
    showToast('Tarefa atualizada com sucesso', 'success');
    closeTaskInspector();
  };

  const handleDelete = async () => {
    await removeTask(task.id);
    showToast('Tarefa excluída', 'info');
    setShowDeleteConfirm(false);
    closeTaskInspector();
  };

  const statusOptions = [
    { id: 'a_fazer', label: 'A Fazer', color: 'var(--color-amber-500, #f59e0b)' },
    { id: 'em_andamento', label: 'Em Andamento', color: 'var(--color-blue-500, #3b82f6)' },
    { id: 'em_revisao', label: 'Em Revisão', color: 'var(--color-purple-500, #a855f7)' },
    { id: 'concluido', label: 'Concluído', color: 'var(--color-emerald-500, #10b981)' },
  ];

  return (
    <>
      <div className="inspector-backdrop" onClick={closeTaskInspector} />
      <aside className="task-inspector-drawer open">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-header-title">
            <span className="drawer-badge">ID #{formData.id}</span>
            {project && <span className="drawer-project-tag">{project.name}</span>}
          </div>
          <button className="drawer-close-btn" onClick={closeTaskInspector} title="Fechar (ESC)">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="drawer-body">
          {/* Task Name Title */}
          <div className="drawer-section">
            <label className="drawer-label">Nome da Tarefa</label>
            <input
              type="text"
              className="drawer-title-input"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Digite o título da tarefa..."
            />
          </div>

          {/* Status Pills */}
          <div className="drawer-section">
            <label className="drawer-label">Status da Tarefa</label>
            <div className="drawer-status-grid">
              {statusOptions.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className={`drawer-status-pill ${formData.status === st.id ? 'active' : ''}`}
                  onClick={() => handleChange('status', st.id)}
                  style={{ '--pill-color': st.color }}
                >
                  <span className="status-dot" />
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Slider & Quick Percent Chips */}
          <div className="drawer-section">
            <div className="drawer-label-row">
              <label className="drawer-label">Progresso Realizado</label>
              <span className="drawer-value-highlight">{formData.progress || 0}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              className="drawer-slider"
              value={formData.progress || 0}
              onChange={(e) => handleChange('progress', Number(e.target.value))}
            />
            <div className="drawer-chips-row">
              {[0, 25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`drawer-chip ${formData.progress === pct ? 'active' : ''}`}
                  onClick={() => handleChange('progress', pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Dates & Duration */}
          <div className="drawer-grid-2">
            <div className="drawer-field">
              <label className="drawer-label">
                <Calendar size={14} /> Data de Início
              </label>
              <input
                type="date"
                className="drawer-input"
                value={formData.startDate || ''}
                onChange={(e) => handleChange('startDate', e.target.value)}
              />
            </div>
            <div className="drawer-field">
              <label className="drawer-label">
                <Calendar size={14} /> Data de Término
              </label>
              <input
                type="date"
                className="drawer-input"
                value={formData.endDate || ''}
                onChange={(e) => handleChange('endDate', e.target.value)}
              />
            </div>
          </div>

          <div className="drawer-grid-2">
            <div className="drawer-field">
              <label className="drawer-label">
                <Clock size={14} /> Duração (Dias)
              </label>
              <input
                type="number"
                min="1"
                className="drawer-input"
                value={formData.duration || 1}
                onChange={(e) => handleChange('duration', Number(e.target.value))}
              />
            </div>
            <div className="drawer-field">
              <label className="drawer-label">
                <Link2 size={14} /> Predecessoras (IDs)
              </label>
              <input
                type="text"
                className="drawer-input"
                value={formData.predecessors || ''}
                onChange={(e) => handleChange('predecessors', e.target.value)}
                placeholder="Ex: 1, 3"
              />
            </div>
          </div>

          {/* Assignee & Milestone Toggle */}
          <div className="drawer-grid-2">
            <div className="drawer-field">
              <label className="drawer-label">
                <User size={14} /> Responsável
              </label>
              <input
                type="text"
                className="drawer-input"
                value={formData.resource || ''}
                onChange={(e) => handleChange('resource', e.target.value)}
                placeholder="Ex: Eng. Roberto"
              />
            </div>
            <div className="drawer-field drawer-field-checkbox">
              <label className="drawer-checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isMilestone)}
                  onChange={(e) => handleChange('isMilestone', e.target.checked)}
                />
                <Flag size={14} className={formData.isMilestone ? 'text-amber' : ''} />
                <span>Marco (Milestone)</span>
              </label>
            </div>
          </div>

          {/* Description */}
          <div className="drawer-section">
            <label className="drawer-label">
              <FileText size={14} /> Observações & Detalhes
            </label>
            <textarea
              className="drawer-textarea"
              rows={3}
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Descreva detalhes executivos da tarefa..."
            />
          </div>

          {/* Anomalies List */}
          {taskAnomalies.length > 0 && (
            <div className="drawer-section drawer-anomalies-section">
              <label className="drawer-label">
                <AlertTriangle size={14} className="text-amber" /> Anomalias Vinculadas ({taskAnomalies.length})
              </label>
              <div className="drawer-anomalies-list">
                {taskAnomalies.map((anom) => (
                  <div key={anom.id} className="drawer-anomaly-card">
                    <div className="drawer-anomaly-title">{anom.title}</div>
                    <div className="drawer-anomaly-meta">
                      <span className={`badge-severity ${anom.severity}`}>{anom.severity}</span>
                      <span>Status: {anom.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="drawer-footer">
          <button
            type="button"
            className="btn btn-danger-ghost"
            onClick={() => setShowDeleteConfirm(true)}
            title="Excluir tarefa"
          >
            <Trash2 size={16} /> Excluir
          </button>
          <div className="drawer-footer-right">
            <button type="button" className="btn btn-secondary" onClick={closeTaskInspector}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Salvar Alterações
            </button>
          </div>
        </div>
      </aside>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Excluir Tarefa"
          message={`Tem certeza que deseja excluir a tarefa "${formData.name}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir Tarefa"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
