import React, { useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import ProgressBar from '../components/ProgressBar';
import Badge from '../components/Badge';
import {
  FolderKanban, CheckSquare, AlertTriangle, TrendingUp,
  Target, Clock, Activity, ChevronRight,
} from 'lucide-react';

import { calculateProjectMetrics } from '../utils/progress';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const HEALTH_MAP = {
  'Boa':     { color: 'green',  label: 'Saudável'  },
  'Atenção': { color: 'orange', label: 'Atenção'   },
  'Crítica': { color: 'red',    label: 'Crítico'   },
  'N/A':     { color: 'gray',   label: 'Sem dados' },
};

export default function PageDashboard() {
  const { state, selectProject } = useContext(AppContext);
  const { projects, tasks, anomalies } = state;

  const todayStr = new Date().toISOString().slice(0, 10);

  /* ── Global KPIs ──────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const active    = projects.filter((p) => p.status === 'Em Andamento').length;
    const completed = projects.filter((p) => p.status === 'Concluído').length;
    const openAnoms = anomalies.filter((a) => a.status === 'aberta').length;
    const critAnoms = anomalies.filter((a) => a.status === 'aberta' && a.severity === 'crítica').length;

    /* Tasks due this week */
    const weekOut = new Date();
    weekOut.setDate(weekOut.getDate() + 7);
    const weekStr = weekOut.toISOString().slice(0, 10);
    const dueSoon = tasks.filter((t) => t.endDate && t.endDate >= todayStr && t.endDate <= weekStr && t.status !== 'Concluída').length;

    return { total: projects.length, active, completed, openAnoms, critAnoms, dueSoon };
  }, [projects, tasks, anomalies, todayStr]);

  /* ── Project health per project ─────────────────────────────── */
  const projectHealth = useMemo(() => {
    return projects.map((p) => {
      const projTasks = tasks.filter((t) => t.projectId === p.id);
      const metrics = calculateProjectMetrics(projTasks);
      
      const openAnoms = anomalies.filter((a) => a.projectId === p.id && a.status === 'aberta').length;
      return { ...p, progress: metrics.progress, health: metrics.health, openAnoms };
    });
  }, [projects, tasks, anomalies]);

  /* ── Upcoming tasks (global, next 7 days) ─────────────────────── */
  const upcoming = useMemo(() => {
    const weekOut = new Date();
    weekOut.setDate(weekOut.getDate() + 7);
    const weekStr = weekOut.toISOString().slice(0, 10);
    return tasks
      .filter((t) => t.endDate && t.endDate >= todayStr && t.endDate <= weekStr && t.status !== 'Concluída')
      .sort((a, b) => (a.endDate > b.endDate ? 1 : -1))
      .slice(0, 8);
  }, [tasks, todayStr]);

  /* ── Recent anomalies (global) ────────────────────────────────── */
  const recentAnoms = useMemo(() => {
    return [...anomalies]
      .filter((a) => a.status === 'aberta')
      .sort((a, b) => (a.reportedAt > b.reportedAt ? -1 : 1))
      .slice(0, 6);
  }, [anomalies]);

  const getProjectName = (projectId) => projects.find((p) => p.id === projectId)?.name || '—';

  return (
    <div className="page-section" id="pageDashboard">
      {/* Global KPI Bar */}
      <div className="kpi-bar">
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-blue)' }}><FolderKanban size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value">{kpis.total}</span><span className="kpi-label">Total de Projetos</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-orange)' }}><Activity size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value">{kpis.active}</span><span className="kpi-label">Em Andamento</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: 'var(--color-emerald)' }}><CheckSquare size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value">{kpis.completed}</span><span className="kpi-label">Concluídos</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: kpis.dueSoon > 0 ? 'var(--color-orange)' : 'var(--color-emerald)' }}><Clock size={20} color="#fff" /></div>
          <div className="kpi-info"><span className="kpi-value" style={{ color: kpis.dueSoon > 0 ? 'var(--color-orange)' : undefined }}>{kpis.dueSoon}</span><span className="kpi-label">Vencem esta semana</span></div>
        </div>
        <div className="kpi-card glass-card">
          <div className="kpi-icon" style={{ background: kpis.critAnoms > 0 ? 'var(--color-coral)' : 'var(--color-emerald)' }}><AlertTriangle size={20} color="#fff" /></div>
          <div className="kpi-info">
            <span className="kpi-value" style={{ color: kpis.critAnoms > 0 ? 'var(--color-coral)' : undefined }}>
              {kpis.openAnoms}
              {kpis.critAnoms > 0 && <span style={{ fontSize: '0.7em', marginLeft: 4 }}>({kpis.critAnoms} críticas)</span>}
            </span>
            <span className="kpi-label">Anomalias Abertas</span>
          </div>
        </div>
      </div>

      {/* Project health grid */}
      {projects.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={64} strokeWidth={1} />
          <h3>Nenhum projeto cadastrado</h3>
          <p>Vá para a página de Projetos para criar o primeiro projeto.</p>
        </div>
      ) : (
        <>
          <div className="page-toolbar" style={{ marginTop: '24px' }}>
            <h2>Saúde dos Projetos</h2>
          </div>
          <div className="dashboard-health-grid">
            {projectHealth.map((p) => {
              const h = HEALTH_MAP[p.health] || HEALTH_MAP['N/A'];
              return (
                <div
                  key={p.id}
                  className={`health-card glass-card health-${h.color}`}
                  onClick={() => selectProject(p.id)}
                  role="button"
                  tabIndex={0}
                  title={`Abrir ${p.name}`}
                >
                  <div className="health-card-header">
                    <span className="health-card-name">{p.name}</span>
                    <Badge label={h.label} color={h.color} />
                  </div>
                  <ProgressBar value={p.progress} height={6} />
                  <div className="health-card-footer">
                    <span>{p.progress}% concluído</span>
                    {p.openAnoms > 0 && (
                      <span className="health-anoms"><AlertTriangle size={12} /> {p.openAnoms}</span>
                    )}
                    <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom row: upcoming + anomalies */}
      {(upcoming.length > 0 || recentAnoms.length > 0) && (
        <div className="overview-grid" style={{ marginTop: '24px' }}>
          {upcoming.length > 0 && (
            <div className="overview-card glass-card">
              <div className="overview-card-header">
                <h3><Clock size={16} /> Próximas Entregas (7 dias)</h3>
              </div>
              <ul className="overview-task-list">
                {upcoming.map((t) => (
                  <li key={t.id} className="overview-task-item">
                    <div className="overview-task-info">
                      <span className="overview-task-name">{t.name}</span>
                      <span className="overview-task-date">{getProjectName(t.projectId)} · {formatDate(t.endDate)}</span>
                    </div>
                    <Badge label={t.status} color={t.status === 'Atrasada' ? 'red' : 'blue'} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recentAnoms.length > 0 && (
            <div className="overview-card glass-card">
              <div className="overview-card-header">
                <h3><AlertTriangle size={16} /> Anomalias Abertas</h3>
              </div>
              <ul className="overview-task-list">
                {recentAnoms.map((a) => (
                  <li key={a.id} className="overview-task-item">
                    <div className="overview-task-info">
                      <span className="overview-task-name">{a.title}</span>
                      <span className="overview-task-date">{getProjectName(a.projectId)}</span>
                    </div>
                    <Badge label={a.severity} color={a.severity === 'crítica' || a.severity === 'alta' ? 'red' : 'orange'} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
