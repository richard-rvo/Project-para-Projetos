import React, { useMemo } from 'react';
import { viewStart, viewEnd } from './useGanttTasks';
import { isMilestone } from '../../utils/schedule';
import { readDependencies } from '../../utils/dependencies';

/* ═══════════════════════════════════════════════════════════════
   Camada de setas de dependência.

   Uma única <svg> cobrindo a área de barras — não uma por linha.
   As bordas de cada tarefa vêm de `edgesOf`, então a geometria do
   marco (losango) fica definida num lugar só, em vez de aparecer
   como "+13" e "−17" soltos no meio do path.

   A seta sai e entra pela ponta que o TIPO do vínculo determina.
   Antes toda seta era desenhada da direita da predecessora para a
   esquerda da sucessora: um vínculo II ou TT aparecia exatamente como
   um TI, e o desenho contradizia o cálculo — que sempre entendeu os
   quatro tipos.
   ═══════════════════════════════════════════════════════════════ */

/** Meia-diagonal do losango de marco, em px. Casa com o CSS. */
const MILESTONE_HALF = 9;
/** Folga entre a barra e o cotovelo da seta. */
const ELBOW = 11;
/** Raio dos cantos arredondados. */
const R = 5;

/** De qual ponta cada tipo sai (predecessora) e entra (sucessora). */
const ANCHORS = {
  FS: { from: 'right', to: 'left' },
  SS: { from: 'left', to: 'left' },
  FF: { from: 'right', to: 'right' },
  SF: { from: 'left', to: 'right' },
};

function edgesOf(task, layout) {
  const start = viewStart(task);
  const end = viewEnd(task);
  if (isMilestone({ startDate: start, endDate: end })) {
    const center = layout.xOf(start, task) + (layout.subday ? 0 : layout.dayWidth / 2);
    return { left: center - MILESTONE_HALF, right: center + MILESTONE_HALF };
  }
  const left = layout.xOf(start, task);
  return { left, right: left + layout.widthOf(start, end, task) };
}

/**
 * Rota ortogonal com cantos arredondados entre duas pontas.
 *
 * O cotovelo simples só serve quando a seta sai pela direita e entra
 * pela esquerda com espaço à frente — o caso TI comum. Todos os
 * outros (II, TT, TS, ou TI apertado) precisam do contorno, que passa
 * pela faixa entre as linhas e por isso funciona para qualquer
 * combinação de pontas.
 */
function buildPath(from, to, rowH) {
  const outX = from.x + (from.side === 'right' ? ELBOW : -ELBOW);
  const inX = to.x + (to.side === 'left' ? -ELBOW : ELBOW);

  const straightShot =
    from.side === 'right' && to.side === 'left' && to.x - from.x >= ELBOW * 2;

  if (straightShot) {
    if (from.y === to.y) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const dir = to.y > from.y ? 1 : -1;
    return [
      `M ${from.x} ${from.y}`,
      `L ${outX - R} ${from.y}`,
      `Q ${outX} ${from.y} ${outX} ${from.y + R * dir}`,
      `L ${outX} ${to.y - R * dir}`,
      `Q ${outX} ${to.y} ${outX + R} ${to.y}`,
      `L ${to.x} ${to.y}`,
    ].join(' ');
  }

  /* Contorno: sai pela ponta de origem, vai até a faixa entre as
     linhas, atravessa e entra pela ponta de destino. */
  const midY = to.y > from.y ? from.y + rowH / 2 : from.y - rowH / 2;
  const sOut = from.side === 'right' ? 1 : -1;   // sentido da saída
  const sIn = to.side === 'left' ? 1 : -1;       // sentido da entrada
  const sMid = inX > outX ? 1 : -1;              // sentido da travessia
  const d1 = midY > from.y ? 1 : -1;
  const d2 = to.y > midY ? 1 : -1;

  return [
    `M ${from.x} ${from.y}`,
    `L ${outX - R * sOut} ${from.y}`,
    `Q ${outX} ${from.y} ${outX} ${from.y + R * d1}`,
    `L ${outX} ${midY - R * d1}`,
    `Q ${outX} ${midY} ${outX + R * sMid} ${midY}`,
    `L ${inX - R * sMid} ${midY}`,
    `Q ${inX} ${midY} ${inX} ${midY + R * d2}`,
    `L ${inX} ${to.y - R * d2}`,
    `Q ${inX} ${to.y} ${inX + R * sIn} ${to.y}`,
    `L ${to.x} ${to.y}`,
  ].join(' ');
}

export default function GanttDependencies({
  tasks,
  layout,
  rowH,
  criticalIds,
  showCriticalPath,
  selectedId,
  visibleRange,
  rowIndexById,
}) {
  const links = useMemo(() => {
    /* Com filtro ou agrupamento, a posição visual da linha deixa de
       ser o índice no array de tarefas. */
    const indexById = rowIndexById || new Map(tasks.map((t, i) => [t.id, i]));
    const result = [];

    /* Só as setas que cruzam a janela visível. Um <path> por vínculo
       em 1.000 tarefas é o que mais pesa no recálculo de scroll. */
    const rangeFrom = visibleRange ? visibleRange.start - 30 : -Infinity;
    const rangeTo = visibleRange ? visibleRange.end + 30 : Infinity;

    tasks.forEach((task) => {
      const rowIndex = indexById.get(task.id);
      if (rowIndex === undefined) return; // filtrada para fora
      if (!viewStart(task) || !viewEnd(task)) return;

      readDependencies(task.dependsOn).forEach((link) => {
        const depId = link.id;
        if (depId === task.id) return;
        const depIndex = indexById.get(depId);
        if (depIndex === undefined) return;

        const dep = tasks.find((t) => t.id === depId);
        if (!dep) return;
        if (!viewStart(dep) || !viewEnd(dep)) return;

        const lo = Math.min(depIndex, rowIndex);
        const hi = Math.max(depIndex, rowIndex);
        if (hi < rangeFrom || lo > rangeTo) return;

        const anchors = ANCHORS[link.type] || ANCHORS.FS;
        const from = edgesOf(dep, layout);
        const to = edgesOf(task, layout);

        const isCritical =
          showCriticalPath && criticalIds.has(task.id) && criticalIds.has(depId);
        const isTouched = selectedId === task.id || selectedId === depId;

        result.push({
          key: `${depId}->${task.id}`,
          d: buildPath(
            { x: from[anchors.from], y: depIndex * rowH + rowH / 2, side: anchors.from },
            { x: to[anchors.to], y: rowIndex * rowH + rowH / 2, side: anchors.to },
            rowH
          ),
          isCritical,
          isTouched,
        });
      });
    });

    return result;
  }, [tasks, layout, rowH, criticalIds, showCriticalPath, selectedId, visibleRange, rowIndexById]);

  if (!links.length) return null;

  return (
    <svg
      className="gantt-deps"
      width={layout.totalWidth}
      height={(rowIndexById ? rowIndexById.size + 1 : tasks.length) * rowH}
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
