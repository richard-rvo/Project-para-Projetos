import React from 'react';
import { formatDateShort } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Cabeçalho de grupo — uma linha como qualquer outra, para a
   virtualização não precisar de um caso especial.
   ═══════════════════════════════════════════════════════════════ */

export default function GanttGroupRow({ row, gridWidth, layout }) {
  const hasSpan = row.start && row.end;

  return (
    <div className="gantt-row is-group">
      <div className="gantt-row-grid" style={{ width: gridWidth }}>
        <div className="gantt-cell gantt-cell-index" />
        <div className="gantt-cell is-left" style={{ flex: '1 1 auto' }}>
          <span className="gantt-group-label">{row.label}</span>
          <span className="gantt-group-count tabular">{row.count}</span>
        </div>
      </div>

      <div className="gantt-row-time" style={{ width: layout.totalWidth }}>
        {hasSpan && (
          <div
            className="gantt-group-span"
            style={{
              left: layout.xOf(row.start),
              width: layout.widthOf(row.start, row.end),
            }}
            title={`${formatDateShort(row.start)} → ${formatDateShort(row.end)}`}
          />
        )}
      </div>
    </div>
  );
}
