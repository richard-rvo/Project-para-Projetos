import React, { useContext, useState, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import ProgressBar from '../components/ProgressBar';
import Badge from '../components/Badge';
import { FileBarChart, Printer, ChevronDown, AlertTriangle, CheckSquare, TrendingUp, Calendar } from 'lucide-react';
import { calculateProjectMetrics, daysBetweenUTC } from '../utils/progress';

/* ── date helpers (UTC-safe) ─────────────────────────────────── */
function addDaysUTC(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_COLORS = { 'Não Iniciada': 'gray', 'Em Andamento': 'blue', 'Concluída': 'green', 'Atrasada': 'red' };
const SEVERITY_COLOR = { baixa: 'blue', média: 'orange', alta: 'red', crítica: 'red' };

export default function PageReports() {
  const { state } = useContext(AppContext);
  const { projects, tasks, anomalies } = state;
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [reportType, setReportType] = useState('status');
  const printRef = useRef(null);

  const project   = projects.find((p) => p.id === selectedProjectId);
  const projTasks = useMemo(() => tasks.filter((t) => t.projectId === selectedProjectId), [tasks, selectedProjectId]);
  const projAnoms = useMemo(() => anomalies.filter((a) => a.projectId === selectedProjectId), [anomalies, selectedProjectId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  /* ── KPIs ─────────────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    if (!project) return {};
    const metrics = calculateProjectMetrics(projTasks);
    
    const done    = projTasks.filter((t) => t.status === 'Concluída').length;
    const delayed = projTasks.filter((t) => t.status === 'Atrasada').length;
    const openAnoms = projAnoms.filter((a) => a.status === 'aberta').length;

    return { 
      progress: metrics.progress, 
      planned: metrics.planned, 
      deviation: metrics.deviation, 
      done, 
      total: projTasks.length, 
      delayed, 
      openAnoms 
    };
  }, [project, projTasks, projAnoms]);

  /* ── S-Curve SVG (mini, for print) ──────────────────────────── */
  const sCurvePoints = useMemo(() => {
    if (!projTasks.length) return { planned: [], actual: [] };
    const starts = projTasks.map((t) => t.startDate).filter(Boolean).sort();
    const ends   = projTasks.map((t) => t.endDate).filter(Boolean).sort();
    if (!starts.length || !ends.length) return { planned: [], actual: [] };
    const minDate = starts[0];
    const maxDate = ends[ends.length - 1];
    const totalDays = daysBetweenUTC(minDate, maxDate) + 1;
    if (totalDays <= 0) return { planned: [], actual: [] };

    const totalDur = projTasks.reduce((s, t) => {
      if (!t.startDate || !t.endDate) return s;
      return s + Math.max(1, daysBetweenUTC(t.startDate, t.endDate));
    }, 0);

    const step = Math.max(1, Math.floor(totalDays / 20));
    const planned = [], actual = [];

    for (let i = 0; i <= totalDays; i += step) {
      const d = addDaysUTC(minDate, i);
      let pSum = 0;
      projTasks.forEach((t) => {
        if (!t.startDate || !t.endDate) return;
        const dur  = Math.max(1, daysBetweenUTC(t.startDate, t.endDate));
        const w    = totalDur > 0 ? dur / totalDur : 1 / projTasks.length;
        const elap = daysBetweenUTC(t.startDate, d) + 1;
        pSum += Math.max(0, Math.min(100, (elap / dur) * 100)) * w;
      });
      planned.push({ day: i, date: d, value: Math.min(100, pSum) });
      if (d <= todayStr) {
        let aSum = 0;
        projTasks.forEach((t) => {
          if (!t.startDate) return;
          const cur = t.progress || 0;
          if (cur === 0) return;
          const endCalc = (t.status === 'Concluída' && t.endDate && t.endDate < todayStr) ? t.endDate : todayStr;
          const totalEl = Math.max(1, daysBetweenUTC(t.startDate, endCalc) + 1);
          const elap    = daysBetweenUTC(t.startDate, d) + 1;
          const dur     = Math.max(1, daysBetweenUTC(t.startDate, t.endDate || todayStr));
          const w       = totalDur > 0 ? dur / totalDur : 1 / projTasks.length;
          let hist = 0;
          if (elap <= 0) hist = 0;
          else if (elap >= totalEl) hist = cur;
          else hist = cur * (elap / totalEl);
          aSum += hist * w;
        });
        actual.push({ day: i, date: d, value: Math.min(100, aSum) });
      }
    }
    return { planned, actual, totalDays, minDate, maxDate };
  }, [projTasks, todayStr]);

  /* SVG drawing */
  const W = 600, H = 200, PAD = { t: 10, r: 20, b: 30, l: 40 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const sx = (i) => PAD.l + (i / Math.max(sCurvePoints.totalDays || 1, 1)) * cW;
  const sy = (v) => PAD.t + cH - (v / 100) * cH;
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.day)} ${sy(p.value)}`).join(' ');

  /* ── print ────────────────────────────────────────────────────── */
  const handlePrint = () => window.print();

  if (!project) {
    return (
      <div className="page-section" id="pageReports">
        <div className="page-toolbar"><h2>Relatórios</h2></div>
        <div className="empty-state">
          <FileBarChart size={64} strokeWidth={1} />
          <h3>Nenhum projeto disponível</h3>
          <p>Crie um projeto primeiro para gerar relatórios.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-section" id="pageReports">
      {/* Controls (hidden on print) */}
      <div className="no-print">


        <div className="reports-controls">
          <div className="reports-filters">
            <div className="form-group">
              <label>Projeto</label>
              <div className="select-wrapper">
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </div>
            <div className="form-group">
              <label>Tipo de Relatório</label>
              <div className="select-wrapper">
                <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                  <option value="status">Status Executivo</option>
                  <option value="anomalies">Relatório de Anomalias</option>
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </div>
          </div>
          <button className="btn-primary" onClick={handlePrint} style={{ height: 48, padding: '0 24px' }}>
            <Printer size={16} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* PRINTABLE REPORT */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div ref={printRef} className="print-report">
        {/* Report header */}
        <div className="report-header">
          <div className="report-logo">
            <img src="/logo.png" alt="Logo" style={{ height: 48, objectFit: 'contain' }} />
            <div>
              <div className="report-software-name">PROJETA</div>
              <div className="report-software-sub">Sistema de Gestão de Projetos</div>
            </div>
          </div>
          <div className="report-title-block">
            <h1 className="report-title">
              {reportType === 'status' ? 'Relatório de Status Executivo' : 'Relatório de Anomalias'}
            </h1>
            <div className="report-subtitle">{project.name}</div>
          </div>
          <div className="report-meta">
            <span>Emitido em: {formatDate(todayStr)}</span>
            {project.startDate && <span>Início: {formatDate(project.startDate)}</span>}
            {project.endDate && <span>Término Previsto: {formatDate(project.endDate)}</span>}
          </div>
        </div>

        <hr className="report-divider" />

        {reportType === 'status' && (
          <>
            {/* Executive summary */}
            <section className="report-section">
              <h2 className="report-section-title">Resumo Executivo</h2>
              <div className="report-kpi-row">
                <div className="report-kpi" style={{ borderLeftColor: 'var(--color-blue)' }}>
                  <span className="report-kpi-value">{kpis.progress}%</span>
                  <span className="report-kpi-label">Progresso Real</span>
                </div>
                <div className="report-kpi" style={{ borderLeftColor: 'var(--color-gray-400)' }}>
                  <span className="report-kpi-value">{kpis.planned}%</span>
                  <span className="report-kpi-label">Planejado (Hoje)</span>
                </div>
                <div className="report-kpi" style={{ borderLeftColor: kpis.deviation >= 0 ? 'var(--color-green)' : 'var(--color-coral)' }}>
                  <span className="report-kpi-value" style={{ color: kpis.deviation >= 0 ? 'var(--color-green)' : 'var(--color-coral)' }}>
                    {kpis.deviation > 0 ? '+' : ''}{Math.round(kpis.deviation)}%
                  </span>
                  <span className="report-kpi-label">Desvio ({kpis.deviation >= 0 ? 'Adiantado' : 'Atrasado'})</span>
                </div>
                <div className="report-kpi" style={{ borderLeftColor: 'var(--color-primary)' }}>
                  <span className="report-kpi-value">{kpis.done}/{kpis.total}</span>
                  <span className="report-kpi-label">Tarefas Concluídas</span>
                </div>
                <div className="report-kpi" style={{ borderLeftColor: kpis.delayed > 0 ? 'var(--color-coral)' : 'var(--color-green)' }}>
                  <span className="report-kpi-value" style={{ color: kpis.delayed > 0 ? 'var(--color-coral)' : 'var(--color-text-primary)' }}>{kpis.delayed}</span>
                  <span className="report-kpi-label">Tarefas Atrasadas</span>
                </div>
                <div className="report-kpi" style={{ borderLeftColor: kpis.openAnoms > 0 ? 'var(--color-orange)' : 'var(--color-green)' }}>
                  <span className="report-kpi-value" style={{ color: kpis.openAnoms > 0 ? 'var(--color-orange)' : 'var(--color-text-primary)' }}>{kpis.openAnoms}</span>
                  <span className="report-kpi-label">Anomalias Abertas</span>
                </div>
              </div>
              {project.description && <p className="report-desc">{project.description}</p>}
            </section>

            <hr className="report-divider" />

            {/* S-Curve */}
            {sCurvePoints.planned?.length > 0 && (
              <section className="report-section">
                <h2 className="report-section-title">Curva S — Planejado vs Realizado</h2>
                <div className="report-chart-legend">
                  <span style={{ color: '#3b82f6' }}>━━ Planejado</span>
                  <span style={{ color: '#10b981', marginLeft: 20 }}>- - Realizado</span>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 220, display: 'block', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  {[0, 25, 50, 75, 100].map((v) => (
                    <g key={v}>
                      <line x1={PAD.l} y1={sy(v)} x2={W - PAD.r} y2={sy(v)} stroke="#e5e7eb" strokeDasharray="3 2" />
                      <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={9} fill="#6b7280">{v}%</text>
                    </g>
                  ))}
                  <line x1={PAD.l} y1={PAD.t + cH} x2={W - PAD.r} y2={PAD.t + cH} stroke="#d1d5db" />
                  {sCurvePoints.planned?.filter((_, i) => i % Math.max(1, Math.floor((sCurvePoints.planned.length - 1) / 6)) === 0).map((p) => (
                    <text key={p.day} x={sx(p.day)} y={H - 5} textAnchor="middle" fontSize={8} fill="#6b7280">
                      {new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </text>
                  ))}
                  {sCurvePoints.planned?.length > 0 && <path d={toPath(sCurvePoints.planned)} fill="none" stroke="#3b82f6" strokeWidth={1.5} />}
                  {sCurvePoints.actual?.length > 0 && <path d={toPath(sCurvePoints.actual)} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" />}
                </svg>
              </section>
            )}

            <hr className="report-divider" />

            {/* Task list */}
            <section className="report-section">
              <h2 className="report-section-title">Cronograma de Tarefas</h2>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>#</th><th>Tarefa</th><th>Responsável</th><th>Início</th><th>Fim</th><th>Status</th><th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {projTasks.map((t, i) => (
                    <tr key={t.id} className={t.status === 'Atrasada' ? 'row-delayed' : ''}>
                      <td>{i + 1}</td>
                      <td>{t.name}</td>
                      <td>{t.assignee || '—'}</td>
                      <td>{formatDate(t.startDate)}</td>
                      <td>{formatDate(t.endDate)}</td>
                      <td>{t.status}</td>
                      <td>{t.progress || 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Anomalies summary if any */}
            {projAnoms.length > 0 && (
              <>
                <hr className="report-divider" />
                <section className="report-section">
                  <h2 className="report-section-title">Anomalias do Projeto ({projAnoms.length})</h2>
                  <table className="report-table">
                    <thead>
                      <tr><th>#</th><th>Título</th><th>Severidade</th><th>Tipo</th><th>Status</th><th>Responsável</th><th>Data</th></tr>
                    </thead>
                    <tbody>
                      {projAnoms.map((a, i) => (
                        <tr key={a.id}>
                          <td>{i + 1}</td><td>{a.title}</td><td>{a.severity}</td><td>{a.type}</td>
                          <td>{a.status}</td><td>{a.reportedBy}</td><td>{formatDate(a.reportedAt?.slice(0,10))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </>
        )}

        {reportType === 'anomalies' && (
          <>
            <section className="report-section">
              <h2 className="report-section-title">Registro de Anomalias — {project.name}</h2>
              {projAnoms.length === 0 ? (
                <p>Nenhuma anomalia registrada neste projeto.</p>
              ) : (
                projAnoms.map((a, i) => (
                  <div key={a.id} className="report-anomaly-block">
                    <div className="report-anomaly-header">
                      <span className="report-anomaly-num">#{i + 1}</span>
                      <span className="report-anomaly-title">{a.title}</span>
                      <span className="report-anomaly-severity" data-sev={a.severity}>{a.severity?.toUpperCase()}</span>
                      <span className="report-anomaly-status">{a.status}</span>
                    </div>
                    <div className="report-anomaly-detail">
                      {a.description && <p><strong>Descrição:</strong> {a.description}</p>}
                      {a.osNumber && <p><strong>OS:</strong> {a.osNumber}</p>}
                      {a.equipment && <p><strong>Equipamento:</strong> {a.equipment}</p>}
                      {a.location && <p><strong>Localização:</strong> {a.location}</p>}
                      {a.discipline && <p><strong>Disciplina:</strong> {a.discipline}</p>}
                      {a.rootCause && <p><strong>Causa Raiz:</strong> {a.rootCause}</p>}
                      {a.correctiveAction && <p><strong>Ação Corretiva:</strong> {a.correctiveAction}</p>}
                      <p><strong>Registrado por:</strong> {a.reportedBy} em {formatDate(a.reportedAt?.slice(0,10))}</p>
                    </div>
                    {a.photos?.length > 0 && (
                      <div className="report-anomaly-photos">
                        {a.photos.map((src, pi) => (
                          <img key={pi} src={src} alt={`Foto ${pi + 1}`} className="report-photo" />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {/* Footer */}
        <div className="report-footer">
          <span>PROJETA — Gestão de Projetos</span>
          <span>Emitido em {new Date().toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </div>
  );
}
