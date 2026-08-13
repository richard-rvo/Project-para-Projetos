import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ProgressBar from '../components/ProgressBar';
import Badge from '../components/Badge';
import { Plus, Trash2, BarChart2, Calendar, Target, TrendingUp, FolderOpen } from 'lucide-react';
import { calculateProjectMetrics } from '../utils/progress';

function generateId() {
  return Date.now() + Math.random().toString(36).slice(2, 9);
}

export default function PageProjects() {
  const { state, addProject, removeProject, navigate, selectProject, showToast } = useContext(AppContext);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', startDate: '', endDate: '', status: 'Planejado' });

  const projects = state.projects;
  const tasks = state.tasks;

  /* KPIs */
  const kpis = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === 'Em Andamento').length;
    const completed = projects.filter((p) => p.status === 'Concluído').length;
    let sumProgress = 0;
    projects.forEach(p => {
      const projTasks = tasks.filter((t) => t.projectId === p.id);
      const metrics = calculateProjectMetrics(projTasks);
      sumProgress += metrics.progress;
    });
    const avgProgress = total > 0 ? Math.round(sumProgress / total) : 0;
    return { total, active, completed, avgProgress };
  }, [projects, tasks]);

  const handleCreate = async () => {
    if (!form.name.trim()) { showToast('Nome do projeto é obrigatório', 'error'); return; }
    const project = {
      id: generateId(),
      ...form,
      createdAt: new Date().toISOString(),
    };
    await addProject(project);
    setForm({ name: '', description: '', startDate: '', endDate: '', status: 'Planejado' });
    setModalOpen(false);
  };

  const openProject = (id) => {
    selectProject(id);
    navigate('pageProjectWorkspace');
  };

  const getProjectMetrics = (projectId) => {
    const projTasks = tasks.filter((t) => t.projectId === projectId);
    return calculateProjectMetrics(projTasks);
  };

  const getStatusBadge = (status) => {
    const map = {
      'Planejado': { color: 'blue', label: 'Planejado' },
      'Em Andamento': { color: 'orange', label: 'Em Andamento' },
      'Concluído': { color: 'green', label: 'Concluído' },
      'Atrasado': { color: 'red', label: 'Atrasado' },
      'Pausado': { color: 'gray', label: 'Pausado' },
    };
    return map[status] || map['Planejado'];
  };

  return (
    <div className="page-section" id="pageProjects">
      {/* KPI Bar */}
      <div className="kpi-bar">
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-blue)' }}><FolderOpen size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value">{kpis.total}</span>
            <span className="kpi-label">Total Projetos</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-orange)' }}><Target size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value">{kpis.active}</span>
            <span className="kpi-label">Em Andamento</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-emerald)' }}><TrendingUp size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value">{kpis.completed}</span>
            <span className="kpi-label">Concluídos</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-purple)' }}><BarChart2 size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value">{kpis.avgProgress}%</span>
            <span className="kpi-label">Progresso Médio</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="page-toolbar">
        <h2>Projetos</h2>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Novo Projeto
        </button>
      </div>

      {/* Project Cards Grid */}
      {projects.length === 0 ? (
        <div className="empty-state">
          <FolderOpen size={64} strokeWidth={1} />
          <h3>Nenhum projeto cadastrado</h3>
          <p>Crie seu primeiro projeto para começar a gerenciar suas tarefas.</p>
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Criar Projeto
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => {
            const metrics = getProjectMetrics(project.id);
            const taskCount = tasks.filter((t) => t.projectId === project.id).length;
            const badge = getStatusBadge(project.status);
            
            let healthColor = 'gray';
            if (metrics.health === 'Boa') healthColor = 'green';
            else if (metrics.health === 'Atenção') healthColor = 'orange';
            else if (metrics.health === 'Crítica') healthColor = 'red';
            
            return (
              <div key={project.id} className="project-card glass-card" onClick={() => openProject(project.id)}>
                <div className="project-card-header">
                  <h3 className="project-card-title">{project.name}</h3>
                  <button
                    className="btn-icon-only btn-danger-ghost"
                    onClick={(e) => { e.stopPropagation(); setConfirmId(project.id); }}
                    title="Remover projeto"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {project.description && <p className="project-card-desc">{project.description}</p>}
                <div className="project-card-meta">
                  <Badge label={badge.label} color={badge.color} />
                  <Badge label={`Saúde: ${metrics.health}`} color={healthColor} />
                  <span className="meta-item"><Calendar size={14} /> {project.startDate || '—'}</span>
                  <span className="meta-item">{taskCount} tarefa{taskCount !== 1 ? 's' : ''}</span>
                </div>
                <ProgressBar value={metrics.progress} showLabel />
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Novo Projeto">
        <div className="form-group">
          <label>Nome do Projeto *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Reforma Coqueria" />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição do projeto..." rows={3} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Data Início</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Data Fim</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Planejado</option>
            <option>Em Andamento</option>
            <option>Concluído</option>
            <option>Pausado</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={handleCreate}>Criar Projeto</button>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => removeProject(confirmId)}
        title="Excluir Projeto"
        message="Tem certeza que deseja excluir este projeto? Todas as tarefas associadas serão removidas."
      />
    </div>
  );
}
