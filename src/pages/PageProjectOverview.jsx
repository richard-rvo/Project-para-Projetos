import React, { useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import ProgressBar from '../components/ProgressBar';
import Badge from '../components/Badge';
import {
  Calendar, CheckSquare, AlertTriangle, TrendingUp, Target,
  Clock, ChevronRight,
} from 'lucide-react';

import { calculateProjectMetrics } from '../utils/progress';
import { today } from '../utils/schedule';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const SEVERITY_COLOR = { baixa: 'blue', média: 'orange', alta: 'red', crítica: 'red' };
const STATUS_COLORS  = { 'Não Iniciada': 'gray', 'Em Andamento': 'blue', 'Concluída': 'green', 'Atrasada': 'red' };

export default function PageProjectOverview() {
  const { state, setProjectTab } = useContext(AppContext);
  const project = state.projects.find((p) => p.id === state.activeProjectId);
  const tasks   = useMemo(() => state.tasks.filter((t) => t.projectId === state.activeProjectId), [state.tasks, state.activeProjectId]);
  const anomalies = useMemo(() => state.anomalies.filter((a) => a.projectId === state.activeProjectId), [state.anomalies, state.activeProjectId]);

  if (!project) return null;

  /* ── KPIs ───────────────────────────────────────────────────── */
  const metrics = calculateProjectMetrics(tasks);
  const progress = metrics.progress;
  const plannedToday = metrics.planned;
  const deviation = metrics.deviation;

  const done      = tasks.filter((t) => t.status === 'Concluída').length;
  const delayed   = tasks.filter((t) => t.status === 'Atrasada').length;
  const openAnoms = anomalies.filter((a) => a.status === 'aberta').length;

  const todayStr = today();

  /* Upcoming tasks (next 14 days, not done) */
  const upcoming = tasks
    .filter((t) => t.endDate && t.endDate >= todayStr && t.status !== 'Concluída')
    .sort((a, b) => (a.endDate > b.endDate ? 1 : -1))
    .slice(0, 6);

  const getStatusBadge = (status) => {
    const map = {
      Planejado: { color: 'blue' }, 'Em Andamento': { color: 'orange' },
      Concluído: { color: 'green' }, Atrasado: { color: 'red' }, Pausado: { color: 'gray' },
    };
    return map[status] || { color: 'gray' };
  };

  return (
    <div className="page-section" id="pageProjectOverview">
      {/* Project meta bar */}
      <div className="overview-meta-bar glass-card">
        <div className="overview-meta-item">
          <Calendar size={15} />
          <span>Início: <strong>{formatDate(project.startDate)}</strong></span>
        </div>
        <div className="overview-meta-item">
          <Calendar size={15} />
          <span>Fim: <strong>{formatDate(project.endDate)}</strong></span>
        </div>
        <div className="overview-meta-item">
          <Badge label={project.status || 'Planejado'} color={getStatusBadge(project.status).color} />
        </div>
        {project.description && (
          <div className="overview-meta-item overview-desc">
            <span>{project.description}</span>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="kpi-bar" style={{ marginTop: '16px' }}>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-blue)' }}><Target size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value">{progress}%</span>
            <span className="kpi-label">Progresso Real</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-purple)' }}><TrendingUp size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value" style={{ color: deviation >= 0 ? 'var(--color-emerald)' : 'var(--color-coral)' }}>
              {deviation > 0 ? '+' : ''}{Math.round(deviation)}%
            </span>
            <span className="kpi-label">Desvio ({deviation >= 0 ? 'Adiantado' : 'Atrasado'})</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-emerald)' }}><CheckSquare size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value">{done} / {tasks.length}</span>
            <span className="kpi-label">Tarefas Concluídas</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: delayed > 0 ? 'var(--color-coral)' : 'var(--color-emerald)' }}><Clock size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value" style={{ color: delayed > 0 ? 'var(--color-coral)' : undefined }}>{delayed}</span>
            <span className="kpi-label">Tarefas Atrasadas</span>
          </div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: openAnoms > 0 ? 'var(--color-orange)' : 'var(--color-emerald)' }}><AlertTriangle size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value" style={{ color: openAnoms > 0 ? 'var(--color-orange)' : undefined }}>{openAnoms}</span>
            <span className="kpi-label">Anomalias Abertas</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="overview-progress-card glass-card">
        <div className="overview-progress-header">
          <span>Progresso Geral do Projeto</span>
          <span className="overview-progress-pct">{progress}%</span>
        </div>
        <ProgressBar value={progress} height={10} />
        <div className="overview-progress-footer">
          <span>Planejado hoje: {Math.round(plannedToday)}%</span>
          <span style={{ color: deviation >= 0 ? 'var(--color-emerald)' : 'var(--color-coral)' }}>
            Desvio: {deviation > 0 ? '+' : ''}{Math.round(deviation)}%
          </span>
        </div>
      </div>

      <div className="overview-grid">
        {/* Upcoming tasks */}
        <div className="overview-card glass-card">
          <div className="overview-card-header">
            <h3><Clock size={16} /> Próximas Entregas</h3>
            <button className="btn-link" onClick={() => setProjectTab('tasklist')}>
              Ver todas <ChevronRight size={14} />
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="overview-empty">Nenhuma tarefa pendente nos próximos dias.</p>
          ) : (
            <ul className="overview-task-list">
              {upcoming.map((t) => (
                <li key={t.id} className="overview-task-item">
                  <div className="overview-task-info">
                    <span className="overview-task-name">{t.name}</span>
                    <span className="overview-task-date"><Calendar size={12} /> {formatDate(t.endDate)}</span>
                  </div>
                  <Badge label={t.status} color={STATUS_COLORS[t.status] || 'gray'} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent anomalies */}
        <div className="overview-card glass-card">
          <div className="overview-card-header">
            <h3><AlertTriangle size={16} /> Anomalias Recentes</h3>
            <button className="btn-link" onClick={() => setProjectTab('anomalies')}>
              Ver todas <ChevronRight size={14} />
            </button>
          </div>
          {anomalies.length === 0 ? (
            <p className="overview-empty">Nenhuma anomalia registrada neste projeto.</p>
          ) : (
            <ul className="overview-task-list">
              {[...anomalies].sort((a, b) => (a.reportedAt > b.reportedAt ? -1 : 1)).slice(0, 5).map((a) => (
                <li key={a.id} className="overview-task-item">
                  <div className="overview-task-info">
                    <span className="overview-task-name">{a.title}</span>
                    <span className="overview-task-date">{formatDate(a.reportedAt?.slice(0, 10))}</span>
                  </div>
                  <Badge label={a.severity} color={SEVERITY_COLOR[a.severity] || 'gray'} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
