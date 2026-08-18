import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarSegments, ViewBarButton } from '../components/shell/ViewBar';
import CurveChart from '../components/CurveChart';
import { calculateProjectMetrics } from '../utils/progress';
import { computeSCurve } from '../utils/scurve';
import {
  today, formatDateLong, formatDateTimeShort,
} from '../utils/schedule';
import { calendarOf } from '../utils/calendar';
import { workingMinutesBetween } from '../utils/worktime';
import { formatDuration } from '../utils/duration';
import { formatDatetime } from '../components/anomalies/anomalyConfig';
import { countByStage, stageLabel, isLate, lateDays } from '../utils/taskState';
import { Printer, FileBarChart } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   RELATÓRIOS — pré-visualização A4 real

   A folha aparece como folha: fundo branco, largura de A4, sombra
   sobre uma mesa recuada. O que está na tela é o que sai na
   impressora, então gerar o PDF não reserva surpresas.

   A Curva S usa o mesmo <CurveChart> da tela. Antes o relatório
   tinha SVG próprio e cálculo próprio, e podia discordar do que o
   usuário acabara de ver na Curva S.
   ═══════════════════════════════════════════════════════════════ */

const TYPES = [
  { id: 'status', label: 'Status executivo' },
  { id: 'anomalies', label: 'Anomalias' },
];

export default function PageReports() {
  const { state } = useContext(AppContext);
  const { projects, tasks, anomalies } = state;

  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [type, setType] = useState('status');

  const project = projects.find((p) => p.id === projectId) || projects[0];

  const projTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project?.id),
    [tasks, project]
  );
  const projAnomalies = useMemo(
    () => anomalies.filter((a) => a.projectId === project?.id),
    [anomalies, project]
  );
  const curve = useMemo(() => computeSCurve(projTasks, 30), [projTasks]);

  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <FileBarChart size={40} strokeWidth={1.2} className="text-text-3" />
        <div>
          <h3 className="text-read font-semibold text-text-1">Nenhum projeto disponível</h3>
          <p className="mt-1 text-small text-text-2">Crie um projeto para gerar relatórios.</p>
        </div>
      </div>
    );
  }

  const metrics = calculateProjectMetrics(projTasks);
  const counts = countByStage(projTasks);
  const done = counts.done;
  const late = counts.late;
  const openAnomalies = projAnomalies.filter((a) => a.status === 'aberta').length;

  return (
    <div className="flex h-full flex-col">
      <ViewBar className="no-print">
        <select
          value={project?.id || ''}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-7.5 max-w-64 rounded-[6px] border border-line bg-surface-0 px-2 text-small text-text-1 focus:border-line-strong"
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ViewBarSegments options={TYPES} value={type} onChange={setType} />
        <div className="ml-auto" />
        <ViewBarButton icon={Printer} variant="primary" onClick={() => window.print()}>
          Imprimir / PDF
        </ViewBarButton>
      </ViewBar>

      {/* Mesa de trabalho: a folha flutua sobre um fundo recuado. */}
      <div className="min-h-0 flex-1 overflow-auto bg-surface-inset p-6">
        <article className="print-report mx-auto w-[210mm] max-w-full bg-white p-[14mm] text-[#111] shadow-elev-3">
          <header className="mb-6 flex items-start gap-4 border-b-2 border-[#111] pb-4">
            <img src="/logo.png" alt="" className="h-11 w-11 object-contain" />
            <div className="flex-1">
              <div className="text-[15px] font-bold tracking-tight">PROJETA</div>
              <div className="text-[10px] uppercase tracking-wide text-[#666]">
                Sistema de gestão de projetos
              </div>
            </div>
            <div className="text-right text-[10px] leading-relaxed text-[#666]">
              <div>Emitido em {formatDateLong(today())}</div>
              {project.startDate && <div>Início {formatDateLong(project.startDate)}</div>}
              {project.endDate && <div>Término {formatDateLong(project.endDate)}</div>}
            </div>
          </header>

          <h1 className="text-[19px] font-bold leading-tight">
            {type === 'status' ? 'Relatório de status executivo' : 'Relatório de anomalias'}
          </h1>
          <p className="mb-6 text-[13px] text-[#555]">{project.name}</p>

          {type === 'status' ? (
            <>
              <Section title="Resumo executivo">
                <div className="grid grid-cols-5 gap-px bg-[#ddd]">
                  <Kpi label="Progresso real" value={`${metrics.progress}%`} />
                  <Kpi
                    label="Planejado"
                    value={metrics.hasBaseline ? `${metrics.planned}%` : '—'}
                  />
                  <Kpi
                    label="Desvio"
                    value={metrics.hasBaseline
                      ? `${metrics.deviation > 0 ? '+' : ''}${metrics.deviation}%`
                      : '—'}
                    tone={metrics.hasBaseline && metrics.deviation < 0 ? '#b4331f' : '#1d7a4c'}
                  />
                  <Kpi label="Tarefas" value={`${done}/${projTasks.length}`} />
                  <Kpi label="Atrasadas" value={late} tone={late ? '#b4331f' : undefined} />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[#444]">
                  {metrics.hasBaseline ? (
                    <>
                      Saúde do projeto: <strong>{metrics.health}</strong>.{' '}
                      {metrics.deviation < 0
                        ? `A execução está ${Math.abs(metrics.deviation)} pontos abaixo do planejado.`
                        : 'A execução está no ritmo planejado ou acima dele.'}
                    </>
                  ) : (
                    <>
                      Sem linha de base gravada, não há planejado contra o que
                      comparar — o desvio e a saúde ficam indisponíveis. Grave uma
                      linha de base no Gantt para que este relatório passe a
                      medir progresso contra plano.
                    </>
                  )}
                  {late > 0 && ` ${late} tarefa(s) além do término.`}
                  {openAnomalies > 0 && ` ${openAnomalies} anomalia(s) em aberto.`}
                </p>
              </Section>

              {curve.points.length > 1 && (
                <Section title="Curva S — planejado vs realizado">
                  <CurveChart curve={curve} height={190} />
                </Section>
              )}

              <Section title={`Cronograma (${projTasks.length} tarefas)`}>
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-[#111]">
                      {['#', 'Tarefa', 'Início', 'Término', 'Dur.', '%', 'Status'].map((h) => (
                        <th key={h} className="px-1.5 py-1 text-left font-semibold uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projTasks.map((t, i) => (
                      <tr key={t.id} className="border-b border-[#eee]">
                        <td className="px-1.5 py-1 tabular-nums text-[#888]">{i + 1}</td>
                        <td className="px-1.5 py-1">{t.name}</td>
                        <td className="px-1.5 py-1 tabular-nums">{formatDateTimeShort(t.startDate)}</td>
                        <td className="px-1.5 py-1 tabular-nums">{formatDateTimeShort(t.endDate)}</td>
                        {/* Dias ÚTEIS do calendário da tarefa, como no Gantt. Com dias
                            corridos o relatório dizia 16d onde a tela dizia 12d. */}
                        <td className="px-1.5 py-1 tabular-nums">
                          {formatDuration(
                            workingMinutesBetween(calendarOf(project, t), t.startDate, t.endDate),
                            calendarOf(project, t)
                          )}
                        </td>
                        <td className="px-1.5 py-1 tabular-nums">{t.progress || 0}%</td>
                        <td className={cn('px-1.5 py-1', isLate(t) && 'font-semibold text-[#b4331f]')}>
                          {isLate(t) ? `${stageLabel(t)} · ${lateDays(t)}d` : stageLabel(t)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              {projAnomalies.length > 0 && (
                <Section title={`Anomalias (${projAnomalies.length})`}>
                  <ul className="flex flex-col gap-1 text-[10px]">
                    {projAnomalies.map((a) => (
                      <li key={a.id} className="flex gap-2 border-b border-[#eee] pb-1">
                        <span className="w-16 shrink-0 font-semibold uppercase">{a.severity}</span>
                        <span className="flex-1">{a.title}</span>
                        <span className="shrink-0 text-[#666]">{a.status}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            <Section title={`Registro de anomalias (${projAnomalies.length})`}>
              {projAnomalies.length === 0 ? (
                <p className="text-[11px] text-[#666]">Nenhuma anomalia registrada neste projeto.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {projAnomalies.map((a) => (
                    <article key={a.id} className="break-inside-avoid border-b border-[#ddd] pb-3">
                      <div className="flex items-baseline gap-2">
                        <h3 className="flex-1 text-[12px] font-semibold">{a.title}</h3>
                        <span className="text-[9px] uppercase tracking-wide text-[#666]">
                          {a.severity} · {a.status}
                        </span>
                      </div>
                      {a.description && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[#333]">{a.description}</p>
                      )}
                      <dl className="mt-1.5 grid grid-cols-4 gap-x-3 gap-y-0.5 text-[9px] text-[#555]">
                        <Pair label="Registrado por" value={a.reportedBy} />
                        <Pair label="Em" value={formatDatetime(a.reportedAt)} />
                        {a.equipment && <Pair label="Equipamento" value={a.equipment} />}
                        {a.location && <Pair label="Local" value={a.location} />}
                        {a.osNumber && <Pair label="OS" value={a.osNumber} />}
                        {a.rootCause && <Pair label="Causa raiz" value={a.rootCause} />}
                        {a.correctiveAction && <Pair label="Ação" value={a.correctiveAction} />}
                      </dl>
                      {a.photos?.length > 0 && (
                        <div className="mt-2 flex gap-1.5">
                          {a.photos.map((src, i) => (
                            <img key={i} src={src} alt="" className="h-20 w-20 rounded object-cover" />
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </Section>
          )}

          <footer className="mt-8 border-t border-[#ddd] pt-2 text-[9px] text-[#888]">
            Projeta · {project.name} · gerado em {formatDateLong(today())}
          </footer>
        </article>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-[#ddd] pb-1 text-[11px] font-bold uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className="bg-white px-2 py-2 text-center">
      <div className="text-[8px] uppercase tracking-wide text-[#777]">{label}</div>
      <div className="text-[16px] font-bold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Pair({ label, value }) {
  return (
    <div>
      <span className="text-[#999]">{label}: </span>
      <span>{value}</span>
    </div>
  );
}
