import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarSegments, ViewBarButton } from '../components/shell/ViewBar';
import CurveChart from '../components/CurveChart';
import { computeSCurve } from '../utils/scurve';
import { today, addDays, formatDateLong } from '../utils/schedule';
import { TrendingUp, Download, Target, GanttChartSquare } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   CURVA S — planejado vs realizado

   A página inteira era ~240 linhas de SVG escrito à mão. O cálculo
   virou utils/scurve.js na Fase 5 e o desenho virou <CurveChart>, o
   mesmo componente que a Visão Geral usa — então tela, visão geral e
   relatório impresso não têm como divergir.

   O que sobrou aqui é o que é próprio desta página: a janela de
   tempo e a leitura numérica do desvio.
   ═══════════════════════════════════════════════════════════════ */

const RANGES = [
  { id: 'all', label: 'Tudo' },
  { id: '90', label: '90 dias' },
  { id: '30', label: '30 dias' },
];

export default function PageSCurve() {
  const { state, setProjectTab } = useContext(AppContext);
  const [range, setRange] = useState('all');

  const project = state.projects.find((p) => p.id === state.activeProjectId);
  const tasks = useMemo(
    () => state.tasks.filter((t) => t.projectId === state.activeProjectId),
    [state.tasks, state.activeProjectId]
  );

  /* A janela recorta as TAREFAS, não os pontos: recortar a curva
     pronta daria percentuais que não somam o projeto inteiro. */
  const windowed = useMemo(() => {
    if (range === 'all') return tasks;
    const from = addDays(today(), -Number(range));
    return tasks.filter((t) => !t.endDate || t.endDate >= from);
  }, [tasks, range]);

  const curve = useMemo(() => computeSCurve(windowed, 60), [windowed]);

  if (!project) return null;

  const behind = curve.deviation < 0;

  const exportCsv = () => {
    const rows = [['Data', 'Planejado (%)', 'Realizado (%)']];
    curve.points.forEach((p) => rows.push([
      p.date,
      p.planned.toFixed(1),
      p.actual === null ? '' : p.actual.toFixed(1),
    ]));
    const blob = new Blob([rows.map((r) => r.join(';')).join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}_CurvaS.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <ViewBarSegments options={RANGES} value={range} onChange={setRange} />
        <div className="ml-auto" />
        <ViewBarButton icon={Download} onClick={exportCsv} disabled={!curve.points.length}>
          CSV
        </ViewBarButton>
      </ViewBar>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!curve.points.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <TrendingUp size={40} strokeWidth={1.2} className="text-text-3" />
            <div>
              <h3 className="text-read font-semibold text-text-1">Sem dados para a curva</h3>
              <p className="mt-1 text-small text-text-2">
                Adicione tarefas com data de início e término.
              </p>
            </div>
          </div>
        ) : !curve.hasBaseline ? (
          /* Antes esta tela derivava o "planejado" das datas ATUAIS —
             as mesmas que o auto-agendamento empurra quando algo
             atrasa. O planejado perseguia o realizado e o desvio
             voltava para zero justamente quando o projeto derrapava.
             Sem linha de base a comparação não existe, e dizer isso é
             mais útil que desenhar duas curvas iguais. */
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Target size={40} strokeWidth={1.2} className="text-text-3" />
            <div>
              <h3 className="text-read font-semibold text-text-1">
                Sem linha de base para comparar
              </h3>
              <p className="mx-auto mt-1 max-w-md text-small leading-relaxed text-text-2">
                A Curva S compara o executado contra o PLANO, não contra o
                cronograma de hoje — que se move junto com os atrasos. Grave uma
                linha de base no Gantt e a comparação passa a existir.
              </p>
            </div>
            <ViewBarButton icon={GanttChartSquare} onClick={() => setProjectTab('gantt')}>
              Ir para o Gantt
            </ViewBarButton>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <section className="flex flex-wrap items-stretch gap-px overflow-hidden rounded-[10px] border border-line bg-line">
              <Metric label="Planejado hoje" value={`${Math.round(curve.plannedToday)}%`} />
              <Metric label="Realizado" value={`${Math.round(curve.actualToday)}%`} />
              <Metric
                label={behind ? 'Atrasado' : 'Adiantado'}
                value={`${curve.deviation > 0 ? '+' : ''}${Math.round(curve.deviation)}%`}
                tone={behind ? 'late' : 'done'}
              />
              <Metric label="Início" value={formatDateLong(curve.minDate)} small />
              <Metric label="Término" value={formatDateLong(curve.maxDate)} small />
            </section>

            <section className="rounded-[10px] border border-line bg-surface-1 p-5">
              <CurveChart curve={curve} height={380} />
            </section>

            <p className="text-small leading-relaxed text-text-2">
              A área entre as curvas é o desvio acumulado.{' '}
              {behind
                ? 'A execução está abaixo do planejado — a faixa vermelha mostra o quanto.'
                : 'A execução está acima do planejado — a faixa verde mostra a margem.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone, small }) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-0.5 bg-surface-1 px-4 py-3">
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">{label}</span>
      <span
        className={cn(
          'font-semibold leading-none tracking-tight tabular-nums',
          small ? 'text-read' : 'text-[24px]',
          tone === 'late' ? 'text-sched-late' : tone === 'done' ? 'text-sched-done' : 'text-text-1'
        )}
      >
        {value}
      </span>
    </div>
  );
}
