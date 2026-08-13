import React from 'react';
import { formatDateShort, durationDays, clampProgress } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Tooltip da barra.

   Uma instância só, posicionada por estado — não um Radix Tooltip
   por barra, que criaria centenas de instâncias e listeners num
   cronograma grande. O `title` nativo que existia antes aparecia com
   ~1s de atraso e não respeitava o tema.
   ═══════════════════════════════════════════════════════════════ */

const OFFSET = 14;

export default function GanttTooltip({ data }) {
  if (!data) return null;

  const { task, x, y, flipX } = data;
  const progress = clampProgress(task.progress);
  const planned = task.baselineStart && task.baselineEnd;
  const duration = durationDays(task.startDate, task.endDate);

  return (
    <div
      className="gantt-tooltip"
      style={{
        left: x + (flipX ? -OFFSET : OFFSET),
        top: y + OFFSET,
        transform: flipX ? 'translateX(-100%)' : undefined,
      }}
      role="tooltip"
    >
      <div className="gantt-tooltip-title">{task.name}</div>

      <dl className="gantt-tooltip-grid">
        <dt>Período</dt>
        <dd className="tabular">
          {formatDateShort(task.startDate)} → {formatDateShort(task.endDate)}
        </dd>

        <dt>Duração</dt>
        <dd className="tabular">{duration}d</dd>

        <dt>Progresso</dt>
        <dd className="tabular">{progress}%</dd>

        {task.status && (
          <>
            <dt>Status</dt>
            <dd>{task.status}</dd>
          </>
        )}

        {task.resources && (
          <>
            <dt>Recursos</dt>
            <dd>{task.resources}</dd>
          </>
        )}

        {planned && (
          <>
            <dt>Baseline</dt>
            <dd className="tabular">
              {formatDateShort(task.baselineStart)} → {formatDateShort(task.baselineEnd)}
            </dd>
          </>
        )}
      </dl>

      {task.isBlocked && (
        <div className="gantt-tooltip-flag">
          Bloqueado{task.blockReason ? `: ${task.blockReason}` : ''}
        </div>
      )}
    </div>
  );
}
