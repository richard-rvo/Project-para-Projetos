import React, { useMemo } from 'react';
import { parseDependencies, viewStart, viewEnd } from './useGanttTasks';
import { isMilestone } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Camada de setas de dependência.

   Uma única <svg> cobrindo a área de barras — não uma por linha.
   As bordas de cada tarefa vêm de `edgesOf`, então a geometria do
   marco (losango) fica definida num lugar só, em vez de aparecer
   como "+13" e "−17" soltos no meio do path.
   ═══════════════════════════════════════════════════════════════ */

/** Meia-diagonal do losango de marco, em px. Casa com o CSS. */
const MILESTONE_HALF = 9;
/** Folga entre a barra e o cotovelo da seta. */
const ELBOW = 11;
/** Raio dos cantos arredondados. */
const R = 5;

function edgesOf(task, layout) {
  const start = viewStart(task);
  const end = viewEnd(task);
  if (isMilestone({ startDate: start, endDate: end })) {
    const center = layout.xOf(start) + layout.dayWidth / 2;
    return { left: center - MILESTONE_HALF, right: center + MILESTONE_HALF };
  }
  const left = layout.xOf(start);
  return { left, right: left + layout.widthOf(start, end) };
}

/**
 * Rota ortogonal com cantos arredondados.
 * Quando há espaço à frente, faz um cotovelo simples; quando a
 * sucessora começa antes do fim da predecessora, contorna por baixo
 * (ou por cima) para não atravessar as barras.
 */
function buildPath(fromX, fromY, toX, toY, rowH) {
  const gap = toX - fromX;

  if (gap >= ELBOW * 2) {
    if (fromY === toY) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    const midX = fromX + ELBOW;
    const dir = toY > fromY ? 1 : -1;
    return [
      `M ${fromX} ${fromY}`,
      `L ${midX - R} ${fromY}`,
      `Q ${midX} ${fromY} ${midX} ${fromY + R * dir}`,
      `L ${midX} ${toY - R * dir}`,
      `Q ${midX} ${toY} ${midX + R} ${toY}`,
      `L ${toX} ${toY}`,
    ].join(' ');
  }

  /* Contorno: sai à direita, desce até a faixa entre as linhas,
     volta à esquerda e entra pela esquerda da sucessora. */
  const outX = fromX + ELBOW;
  const inX = toX - ELBOW;
  const midY = toY > fromY ? fromY + rowH / 2 : fromY - rowH / 2;
  const d1 = midY > fromY ? 1 : -1;
  const d2 = toY > midY ? 1 : -1;

  return [
    `M ${fromX} ${fromY}`,
    `L ${outX - R} ${fromY}`,
    `Q ${outX} ${fromY} ${outX} ${fromY + R * d1}`,
    `L ${outX} ${midY - R * d1}`,
    `Q ${outX} ${midY} ${outX - R} ${midY}`,
    `L ${inX + R} ${midY}`,
    `Q ${inX} ${midY} ${inX} ${midY + R * d2}`,
    `L ${inX} ${toY - R * d2}`,
    `Q ${inX} ${toY} ${inX + R} ${toY}`,
    `L ${toX} ${toY}`,
  ].join(' ');
}

export default function GanttDependencies({
  tasks,
  layout,
  rowH,
  criticalIds,
  showCriticalPath,
  selectedId,
}) {
  const links = useMemo(() => {
    const indexById = new Map(tasks.map((t, i) => [t.id, i]));
    const result = [];

    tasks.forEach((task, rowIndex) => {
      if (!viewStart(task) || !viewEnd(task)) return;

      parseDependencies(task.dependsOn).forEach((depId) => {
        if (depId === task.id) return;
        const depIndex = indexById.get(depId);
        if (depIndex === undefined) return;

        const dep = tasks[depIndex];
        if (!viewStart(dep) || !viewEnd(dep)) return;

        const from = edgesOf(dep, layout);
        const to = edgesOf(task, layout);

        const isCritical =
          showCriticalPath && criticalIds.has(task.id) && criticalIds.has(depId);
        const isTouched = selectedId === task.id || selectedId === depId;

        result.push({
          key: `${depId}->${task.id}`,
          d: buildPath(
            from.right,
            depIndex * rowH + rowH / 2,
            to.left,
            rowIndex * rowH + rowH / 2,
            rowH
          ),
          isCritical,
          isTouched,
        });
      });
    });

    return result;
  }, [tasks, layout, rowH, criticalIds, showCriticalPath, selectedId]);

  if (!links.length) return null;

  return (
    <svg
      className="gantt-deps"
      width={layout.totalWidth}
      height={tasks.length * rowH}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="gantt-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6.5"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" className="gantt-dep-head" />
        </marker>
        <marker
          id="gantt-arrow-critical"
          markerWidth="7"
          markerHeight="7"
          refX="6.5"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" className="gantt-dep-head is-critical" />
        </marker>
      </defs>

      {links.map((link) => (
        <path
          key={link.key}
          d={link.d}
          className={[
            'gantt-dep',
            link.isCritical ? 'is-critical' : '',
            link.isTouched ? 'is-touched' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          markerEnd={`url(#gantt-arrow${link.isCritical ? '-critical' : ''})`}
        />
      ))}
    </svg>
  );
}
