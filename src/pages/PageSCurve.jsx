import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { TrendingUp } from 'lucide-react';

import { daysBetween, addDays, durationDays, today } from '../utils/schedule';

export default function PageSCurve() {
  const { state } = useContext(AppContext);
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const projectTasks = useMemo(
    () => state.tasks.filter((t) => t.projectId === state.activeProjectId),
    [state.tasks, state.activeProjectId]
  );

  /* Tooltip state */
  const [tooltip, setTooltip] = useState(null); // { x, y, planned, actual, date }

  if (!activeProject) {
    return (
      <div className="page-section" id="pageSCurve">
        <div className="empty-state">
          <TrendingUp size={48} strokeWidth={1} />
          <h3>Nenhum projeto selecionado</h3>
          <p>Selecione um projeto para visualizar a Curva S.</p>
        </div>
      </div>
    );
  }

  if (projectTasks.length === 0) {
    return (
      <div className="page-section" id="pageSCurve">
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
    const ends   = projectTasks.map((t) => t.endDate).filter(Boolean).sort();
    if (!starts.length || !ends.length) return { points: [], planned: [], actual: [] };

    const minDate   = starts[0];
    const maxDate   = ends[ends.length - 1];
    const totalDays = durationDays(minDate, maxDate);
    const todayStr  = today();

    /* ── Weighted total duration (for proportional progress) ── */
    const totalDuration = projectTasks.reduce((sum, t) => {
      if (!t.startDate || !t.endDate) return sum;
      return sum + Math.max(1, durationDays(t.startDate, t.endDate));
    }, 0) || 1;

    /* ── Sample every N days to avoid crowded labels ────────── */
    const sampleStep = Math.max(1, Math.floor(totalDays / 30));

    const planned = [];
    const actual  = [];

    for (let i = 0; i <= totalDays; i++) {
      const isSample = i % sampleStep === 0 || i === totalDays;
      if (!isSample) continue;

      const d = addDays(minDate, i);

      // ── Planned: weighted average across tasks ───────────────
      let pSum = 0;
      projectTasks.forEach((t) => {
        if (!t.startDate || !t.endDate) return;
        const dur    = Math.max(1, durationDays(t.startDate, t.endDate));
        const weight = dur / totalDuration;
        const elapsed = durationDays(t.startDate, d);
        const expected = Math.max(0, Math.min(100, (elapsed / dur) * 100));
        pSum += expected * weight;
      });
      planned.push({ day: i, date: d, value: Math.min(100, pSum) });

      // ── Actual (only up to today) ────────────────────────────
      if (d <= todayStr) {
        let aSum = 0;
        projectTasks.forEach((t) => {
          if (!t.startDate) return;
          const cur = t.progress || 0;
          if (cur === 0) return;
          const dur = Math.max(1, durationDays(t.startDate, t.endDate || todayStr));
          const weight = dur / totalDuration;
          const endCalcDate =
            t.status === 'Concluída' && t.endDate && t.endDate < todayStr
              ? t.endDate
              : todayStr;
          const totalElapsed = Math.max(1, durationDays(t.startDate, endCalcDate));
          const elapsedToDay = durationDays(t.startDate, d);
          let histProgress = 0;
          if (elapsedToDay <= 0) histProgress = 0;
          else if (elapsedToDay >= totalElapsed) histProgress = cur;
          else histProgress = cur * (elapsedToDay / totalElapsed);
          aSum += histProgress * weight;
        });
        actual.push({ day: i, date: d, value: Math.min(100, aSum) });
      }
    }

    return { planned, actual, totalDays, minDate, maxDate };
  }, [projectTasks]);

  /* ── Deviation ─────────────────────────────────────────────── */
  const todayStr      = today();
  const lastActual    = curveData.actual.length > 0 ? curveData.actual[curveData.actual.length - 1].value : 0;
  const plannedTodayObj = curveData.planned.find((p) => p.date === todayStr)
    || curveData.planned[curveData.planned.length - 1];
  const plannedToday  = plannedTodayObj ? plannedTodayObj.value : 0;
  const deviation     = lastActual - plannedToday;
  const isAhead       = deviation >= 0;

  /* ── SVG chart ─────────────────────────────────────────────── */
  const svgWidth  = 1200;
  const svgHeight = 400;
  const padding   = { top: 30, right: 30, bottom: 50, left: 60 };
  const chartW    = svgWidth - padding.left - padding.right;
  const chartH    = svgHeight - padding.top - padding.bottom;

  const scaleX = (i) => padding.left + (i / Math.max(curveData.totalDays || 1, 1)) * chartW;
  const scaleY = (v) => padding.top + chartH - (v / 100) * chartH;

  const toPath = (points) => {
    if (!points.length) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.day)} ${scaleY(p.value)}`).join(' ');
  };

  /* Today line X position */
  const todayDayIdx = daysBetween(curveData.minDate || todayStr, todayStr);
  const todayX = curveData.minDate ? scaleX(Math.max(0, Math.min(curveData.totalDays || 0, todayDayIdx))) : null;

  /* Label frequency for X axis */
  const yLabels = [0, 25, 50, 75, 100];

  /* ── Hover handlers ────────────────────────────────────────── */
  const handleSvgMouseMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const dayRatio = (svgX - padding.left) / chartW;
    const dayIdx = Math.round(dayRatio * (curveData.totalDays || 0));
    if (dayIdx < 0 || dayIdx > (curveData.totalDays || 0)) { setTooltip(null); return; }

    const pPt = curveData.planned.reduce((best, p) => !best || Math.abs(p.day - dayIdx) < Math.abs(best.day - dayIdx) ? p : best, null);
    const aPt = curveData.actual.reduce((best, p) => !best || Math.abs(p.day - dayIdx) < Math.abs(best.day - dayIdx) ? p : best, null);

    if (pPt) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        date: pPt.date,
        planned: Math.round(pPt.value),
        actual: aPt ? Math.round(aPt.value) : null,
      });
    }
  };

  return (
    <div className="page-section" id="pageSCurve">
      <div className="page-toolbar">
        <h2>{activeProject.name} — Curva S</h2>
      </div>

      <div className="scurve-container glass-card" style={{ position: 'relative' }}>
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
          <div className="legend-item">
            <span className="legend-dash" style={{ background: '#888', width: 18, height: 2, display: 'inline-block', verticalAlign: 'middle' }} />
            <span style={{ marginLeft: 6 }}>Hoje</span>
          </div>
        </div>

        {/* SVG */}
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="scurve-svg"
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: 'crosshair' }}
        >
          {/* Grid lines */}
          {yLabels.map((v) => (
            <g key={v}>
              <line x1={padding.left} y1={scaleY(v)} x2={svgWidth - padding.right} y2={scaleY(v)} stroke="rgba(128,128,128,0.15)" strokeDasharray="4 2" />
              <text x={padding.left - 10} y={scaleY(v) + 4} textAnchor="end" fill="var(--color-text)" fontSize="12">{v}%</text>
            </g>
          ))}

          {/* X axis */}
          <line x1={padding.left} y1={padding.top + chartH} x2={svgWidth - padding.right} y2={padding.top + chartH} stroke="rgba(128,128,128,0.3)" />

          {/* X axis labels (sampled) */}
          {curveData.planned.filter((_, i) => i % Math.max(1, Math.floor(curveData.planned.length / 10)) === 0).map((p) => (
            <text key={p.day} x={scaleX(p.day)} y={padding.top + chartH + 20} textAnchor="middle" fill="var(--color-text)" fontSize="10">
              {new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </text>
          ))}

          {/* Today vertical line */}
          {todayX !== null && (
            <g>
              <line x1={todayX} y1={padding.top} x2={todayX} y2={padding.top + chartH} stroke="#888" strokeDasharray="6 3" strokeWidth={1.5} />
              <text x={todayX + 6} y={padding.top + 16} fill="#888" fontSize="11" fontWeight="600">Hoje</text>
            </g>
          )}

          {/* Area under actual */}
          {curveData.actual.length > 0 && (
            <path
              d={`${toPath(curveData.actual)} L ${scaleX(curveData.actual[curveData.actual.length - 1].day)} ${scaleY(0)} L ${scaleX(0)} ${scaleY(0)} Z`}
              fill="url(#actualGradient)"
              opacity={0.15}
            />
          )}

          {/* Planned curve */}
          <path d={toPath(curveData.planned)} fill="none" stroke="var(--color-blue)" strokeWidth={2.5} strokeLinecap="round" />

          {/* Planned points (sampled, no labels to avoid clutter) */}
          {curveData.planned.filter((_, i) => i % Math.max(1, Math.floor(curveData.planned.length / 12)) === 0).map((p, i) => (
            <circle key={`p-${i}`} cx={scaleX(p.day)} cy={scaleY(p.value)} r={3} fill="var(--color-blue)" />
          ))}

          {/* Actual curve */}
          <path d={toPath(curveData.actual)} fill="none" stroke="var(--color-emerald)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 3" />

          {/* Actual points (sampled) */}
          {curveData.actual.filter((_, i) => i % Math.max(1, Math.floor(curveData.actual.length / 12)) === 0).map((p, i) => (
            <circle key={`a-${i}`} cx={scaleX(p.day)} cy={scaleY(p.value)} r={4} fill="var(--color-emerald)" />
          ))}

          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-emerald)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="scurve-tooltip"
            style={{ left: Math.min(tooltip.x + 12, 800), top: Math.max(tooltip.y - 60, 10) }}
          >
            <div className="tooltip-date">{new Date(tooltip.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div className="tooltip-row" style={{ color: 'var(--color-blue)' }}>Planejado: <strong>{tooltip.planned}%</strong></div>
            {tooltip.actual !== null && (
              <div className="tooltip-row" style={{ color: 'var(--color-emerald)' }}>Realizado: <strong>{tooltip.actual}%</strong></div>
            )}
          </div>
        )}

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
