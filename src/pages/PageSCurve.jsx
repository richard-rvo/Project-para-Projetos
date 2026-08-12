import React, { useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { TrendingUp, ChevronLeft } from 'lucide-react';

/* ── date helpers ────────────────────────────────────────────── */
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function PageSCurve() {
  const { state, navigate, selectProject } = useContext(AppContext);
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const projectTasks = useMemo(
    () => state.tasks.filter((t) => t.projectId === state.activeProjectId),
    [state.tasks, state.activeProjectId]
  );

  if (!activeProject) {
    return (
      <div className="page-section" id="pageSCurve">
        <div className="empty-state">
          <TrendingUp size={48} strokeWidth={1} />
          <h3>Nenhum projeto selecionado</h3>
          <p>Selecione um projeto no Painel de Projetos para visualizar a Curva S.</p>
          <button className="btn-primary" onClick={() => navigate('pageProjects')}>Ir para Projetos</button>
        </div>
      </div>
    );
  }

  if (projectTasks.length === 0) {
    return (
      <div className="page-section" id="pageSCurve">
        <div className="page-toolbar">
          <div className="toolbar-left">
            <button className="btn-secondary" onClick={() => { selectProject(null); navigate('pageProjects'); }}>
              <ChevronLeft size={16} /> Projetos
            </button>
            <h2>{activeProject.name} — Curva S</h2>
          </div>
        </div>
        <div className="empty-state glass-card">
          <h3>Sem dados para gerar a curva</h3>
          <p>Adicione tarefas com datas para visualizar a Curva S.</p>
        </div>
      </div>
    );
  }

  /* ── compute S-Curve data ──────────────────────────────────── */
  const curveData = useMemo(() => {
    const starts = projectTasks.map((t) => t.startDate).filter(Boolean).sort();
    const ends = projectTasks.map((t) => t.endDate).filter(Boolean).sort();
    if (starts.length === 0 || ends.length === 0) return { points: [], planned: [], actual: [] };

    const minDate = starts[0];
    const maxDate = ends[ends.length - 1];
    const totalDays = daysBetween(minDate, maxDate) + 1;
    const totalTasks = projectTasks.length;
    const todayStr = new Date().toISOString().slice(0, 10);

    const planned = [];
    const actual = [];

    for (let i = 0; i <= totalDays; i++) {
      const d = addDays(minDate, i);
      
      // 1. Calculate Planned Progress
      let plannedSum = 0;
      projectTasks.forEach(t => {
        if (!t.startDate || !t.endDate) return;
        const duration = daysBetween(t.startDate, t.endDate) + 1;
        const elapsed = daysBetween(t.startDate, d) + 1;
        const expected = Math.max(0, Math.min(100, (elapsed / duration) * 100));
        plannedSum += expected;
      });
      const plannedValue = totalTasks ? (plannedSum / totalTasks) : 0;
      planned.push({ day: i, date: d, value: plannedValue });

      // 2. Calculate Actual Progress (only up to today)
      if (d <= todayStr) {
        let actualSum = 0;
        projectTasks.forEach(t => {
          if (!t.startDate) return;
          const currentProgress = t.progress || 0;
          if (currentProgress === 0) return;
          
          let endCalcDate = todayStr;
          if (t.status === 'Concluída' && t.endDate && t.endDate < todayStr) {
             endCalcDate = t.endDate;
          }
          
          const totalElapsedCalc = daysBetween(t.startDate, endCalcDate) + 1;
          const elapsedSinceStart = daysBetween(t.startDate, d) + 1;

          let historyProgress = 0;
          if (elapsedSinceStart <= 0) {
            historyProgress = 0;
          } else if (elapsedSinceStart >= totalElapsedCalc) {
            historyProgress = currentProgress;
          } else {
            historyProgress = currentProgress * (elapsedSinceStart / Math.max(1, totalElapsedCalc));
          }
          actualSum += historyProgress;
        });
        const actualValue = totalTasks ? (actualSum / totalTasks) : 0;
        actual.push({ day: i, date: d, value: actualValue });
      }
    }

    return { planned, actual, totalDays, minDate, maxDate };
  }, [projectTasks]);

  /* ── Deviation Calculation ─────────────────────────────────── */
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastActual = curveData.actual.length > 0 ? curveData.actual[curveData.actual.length - 1].value : 0;
  const plannedTodayObj = curveData.planned.find(p => p.date === todayStr) 
    || curveData.planned[curveData.planned.length - 1]; // fallback if today is past project end
  const plannedToday = plannedTodayObj ? plannedTodayObj.value : 0;
  
  const deviation = lastActual - plannedToday;
  const isAhead = deviation >= 0;

  /* ── SVG chart ─────────────────────────────────────────────── */
  const svgWidth = 1200;
  const svgHeight = 400;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  const scaleX = (i) => padding.left + (i / Math.max(curveData.totalDays, 1)) * chartW;
  const scaleY = (v) => padding.top + chartH - (v / 100) * chartH;

  const toPath = (points) => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.day)} ${scaleY(p.value)}`).join(' ');
  };

  /* Y axis labels */
  const yLabels = [0, 25, 50, 75, 100];

  return (
    <div className="page-section" id="pageSCurve">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <button className="btn-secondary" onClick={() => { selectProject(null); navigate('pageProjects'); }}>
            <ChevronLeft size={16} /> Projetos
          </button>
          <h2>{activeProject.name} — Curva S</h2>
        </div>
      </div>

      <div className="scurve-container glass-card">
        {/* Legend */}
        <div className="scurve-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--color-blue)' }} />
            <span>Planejado</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--color-emerald)' }} />
            <span>Realizado</span>
          </div>
        </div>

        {/* SVG */}
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="scurve-svg">
          {/* Grid lines */}
          {yLabels.map((v) => (
            <g key={v}>
              <line x1={padding.left} y1={scaleY(v)} x2={svgWidth - padding.right} y2={scaleY(v)} stroke="rgba(128,128,128,0.15)" strokeDasharray="4 2" />
              <text x={padding.left - 10} y={scaleY(v) + 4} textAnchor="end" fill="var(--color-text)" fontSize="12">{v}%</text>
            </g>
          ))}

          {/* X axis */}
          <line x1={padding.left} y1={padding.top + chartH} x2={svgWidth - padding.right} y2={padding.top + chartH} stroke="rgba(128,128,128,0.3)" />

          {/* X axis labels (every ~7 days) */}
          {curveData.planned.filter((_, i) => i % Math.max(1, Math.floor(curveData.totalDays / 10)) === 0).map((p) => (
            <text key={p.day} x={scaleX(p.day)} y={padding.top + chartH + 20} textAnchor="middle" fill="var(--color-text)" fontSize="10">
              {new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </text>
          ))}

          {/* Planned curve */}
          <path d={toPath(curveData.planned)} fill="none" stroke="var(--color-blue)" strokeWidth={2.5} strokeLinecap="round" />
          
          {/* Planned points & labels */}
          {curveData.planned.map((p, i) => (
            <g key={`p-${i}`}>
              <circle cx={scaleX(p.day)} cy={scaleY(p.value)} r={3} fill="var(--color-blue)" />
              <text x={scaleX(p.day)} y={scaleY(p.value) - 8} textAnchor="middle" fill="var(--color-blue)" fontSize="9" fontWeight="bold">
                {Math.round(p.value)}%
              </text>
            </g>
          ))}

          {/* Actual curve */}
          <path d={toPath(curveData.actual)} fill="none" stroke="var(--color-emerald)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 3" />

          {/* Actual points & labels */}
          {curveData.actual.map((p, i) => (
            <g key={`a-${i}`}>
              <circle cx={scaleX(p.day)} cy={scaleY(p.value)} r={4} fill="var(--color-emerald)" />
              <text x={scaleX(p.day)} y={scaleY(p.value) + 12} textAnchor="middle" fill="var(--color-emerald)" fontSize="9" fontWeight="bold">
                {Math.round(p.value)}%
              </text>
            </g>
          ))}

          {/* Area under actual */}
          {curveData.actual.length > 0 && (
            <path
              d={`${toPath(curveData.actual)} L ${scaleX(curveData.actual[curveData.actual.length - 1].day)} ${scaleY(0)} L ${scaleX(0)} ${scaleY(0)} Z`}
              fill="url(#actualGradient)"
              opacity={0.15}
            />
          )}

          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-emerald)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>

        {/* Summary stats */}
        <div className="scurve-stats">
          <div className="stat-item">
            <span className="stat-value">{Math.round(plannedToday)}%</span>
            <span className="stat-label">Planejado (Hoje)</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--color-emerald)' }}>
              {Math.round(lastActual)}%
            </span>
            <span className="stat-label">Realizado Atual</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: isAhead ? 'var(--color-emerald)' : 'var(--color-coral)' }}>
              {deviation > 0 ? '+' : ''}{Math.round(deviation)}%
            </span>
            <span className="stat-label">Desvio ({isAhead ? 'Adiantado' : 'Atrasado'})</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{projectTasks.filter((t) => t.status === 'Concluída').length} / {projectTasks.length}</span>
            <span className="stat-label">Tarefas Concluídas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
