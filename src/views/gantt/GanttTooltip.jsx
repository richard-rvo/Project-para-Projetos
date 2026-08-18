import React from 'react';
import { formatDateTimeShort, isManual } from '../../utils/schedule';
import { viewStart, viewEnd, viewProgress } from './useGanttTasks';

/* ═══════════════════════════════════════════════════════════════
   Tooltip da barra.

   Uma instância só, posicionada por estado — não um Radix Tooltip
   por barra, que criaria centenas de instâncias e listeners num
   cronograma grande. O `title` nativo que existia antes aparecia com
   ~1s de atraso e não respeitava o tema.
   ═══════════════════════════════════════════════════════════════ */

const OFFSET = 14;

export default function GanttTooltip({ data, ctx }) {
  if (!data) return null;

  const { task, x, y, flipX } = data;
  const progress = viewProgress(task);
  const planned = task.baselineStart && task.baselineEnd;
  const start = viewStart(task);
  const end = viewEnd(task);
  const manual = isManual(task);
  const violation = ctx?.analysis?.byId?.get(task.id)?.violationMinutes ?? 0;

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
        <dt>Início</dt>
        <dd className="tabular">{formatDateTimeShort(start)}</dd>

        <dt>Término</dt>
        <dd className="tabular">{formatDateTimeShort(end)}</dd>

        <dt>Duração</dt>
        <dd className="tabular">{ctx?.durationLabel?.(task) ?? ''}</dd>

        <dt>Agendamento</dt>
        <dd>{manual ? 'Manual' : 'Automática'}</dd>

        {task.calendarId && ctx?.calendarFor && (
          <>
            <dt>Calendário</dt>
            <dd>{ctx.calendarFor(task).name}</dd>
          </>
        )}

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
              {formatDateTimeShort(task.baselineStart)} → {formatDateTimeShort(task.baselineEnd)}
            </dd>
          </>
        )}
      </dl>

      {violation > 0 && (
        <div className="gantt-tooltip-flag">
          Começa {ctx.formatMinutes(violation)} antes do que a predecessora
          permite. Por ser manual, não será movida.
        </div>
      )}

      {task.isBlocked && (
        <div className="gantt-tooltip-flag">
          Bloqueado{task.blockReason ? `: ${task.blockReason}` : ''}
        </div>
      )}
    </div>
  );
}
