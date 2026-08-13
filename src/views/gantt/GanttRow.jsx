import React from 'react';
import { ChevronRight, GripVertical } from 'lucide-react';
import { isMilestone, clampProgress } from '../../utils/schedule';
import { STATUS_MODIFIER } from './ganttConfig';

/* ═══════════════════════════════════════════════════════════════
   Uma linha do Gantt = células da planilha + barra, no MESMO
   elemento.

   É essa unidade que faz o hover atravessar as duas metades, e é o
   que dá a sensação de MS Project. Enquanto planilha e timeline eram
   árvores separadas, era impossível destacar a linha inteira.
   ═══════════════════════════════════════════════════════════════ */

export default function GanttRow({ task, index, ctx }) {
  const {
    columns,
    gridWidth,
    layout,
    selectedIds,
    editingCell,
    collapsedIds,
    criticalIds,
    showCriticalPath,
    showBarLabels,
    dragPreview,
    onRowMouseDown,
    onToggleCollapse,
    onStartEdit,
    onEditChange,
    onCommitEdit,
    onCancelEdit,
    onBarMouseDown,
    onResizeMouseDown,
    onBarEnter,
    onBarMove,
    onBarLeave,
    onOpenDetails,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onRowDragEnd,
    dragOverIndex,
    editValue,
    editInputRef,
  } = ctx;

  const selected = selectedIds.has(task.id);
  const critical = showCriticalPath && criticalIds.has(task.id);
  const dimmed = showCriticalPath && !critical;
  const collapsed = collapsedIds.has(task.id);

  /* Enquanto arrasta, a barra segue o cursor sem gravar no banco. */
  const preview = dragPreview?.taskId === task.id ? dragPreview : null;
  const startDate = preview?.startDate ?? task.startDate;
  const endDate = preview?.endDate ?? task.endDate;

  const milestone = isMilestone({ ...task, startDate, endDate });
  const hasDates = Boolean(startDate && endDate);

  const rowClass = [
    'gantt-row',
    selected ? 'is-selected' : '',
    task.isSummary ? 'is-summary' : '',
    dragOverIndex === index ? 'is-drop-target' : '',
    preview ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rowClass}
      data-row={index}
      onMouseDown={(e) => onRowMouseDown(e, task, index)}
      onDoubleClick={() => onOpenDetails(task)}
      draggable={!editingCell}
      onDragStart={(e) => onRowDragStart(e, index)}
      onDragOver={(e) => onRowDragOver(e, index)}
      onDrop={(e) => onRowDrop(e, index)}
      onDragEnd={onRowDragEnd}
    >
      {/* ── Planilha ─────────────────────────────────────────── */}
      <div className="gantt-row-grid" style={{ width: gridWidth }}>
        <div className="gantt-cell gantt-cell-index">
          <GripVertical size={11} className="gantt-grip" />
          <span className="tabular">{index + 1}</span>
        </div>

        {columns.map((col) => {
          const editing =
            editingCell?.taskId === task.id && editingCell?.field === col.field;
          const locked = task.isSummary && col.summaryLocked;

          return (
            <div
              key={col.id}
              className={[
                'gantt-cell',
                `is-${col.align}`,
                editing ? 'is-editing' : '',
                locked ? 'is-locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                width: col.width,
                flex: col.grow ? '1 1 auto' : `0 0 ${col.width}px`,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (col.editable && !locked) onStartEdit(task, col);
              }}
            >
              {editing ? (
                <input
                  ref={editInputRef}
                  className="gantt-cell-input"
                  type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                  value={editValue}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={onCommitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitEdit();
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                  autoFocus
                />
              ) : col.id === 'name' ? (
                <span
                  className="gantt-cell-name"
                  style={{ paddingLeft: (task.indentLevel || 0) * 14 }}
                >
                  {task.hasChildren ? (
                    <button
                      type="button"
                      className={`gantt-twisty ${collapsed ? '' : 'is-open'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse(task.id);
                      }}
                      title={collapsed ? 'Expandir' : 'Recolher'}
                    >
                      <ChevronRight size={12} />
                    </button>
                  ) : (
                    <span className="gantt-twisty-spacer" />
                  )}
                  <span className="gantt-cell-text">{task.name}</span>
                </span>
              ) : (
                <span className="gantt-cell-text tabular">{col.render(task, ctx)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Timeline ─────────────────────────────────────────── */}
      <div className="gantt-row-time" style={{ width: layout.totalWidth }}>
        {task.baselineStart && task.baselineEnd && (
          <div
            className="gantt-baseline"
            style={{
              left: layout.xOf(task.baselineStart),
              width: layout.widthOf(task.baselineStart, task.baselineEnd),
            }}
          />
        )}

        {hasDates && milestone && (
          <div
            className={`gantt-milestone ${critical ? 'is-critical' : ''} ${dimmed ? 'is-dimmed' : ''}`}
            style={{ left: layout.xOf(startDate) + layout.dayWidth / 2 }}
            onMouseDown={(e) => onBarMouseDown(e, task)}
            onMouseEnter={(e) => onBarEnter(e, task)}
            onMouseMove={onBarMove}
            onMouseLeave={onBarLeave}
          >
            <span className="gantt-milestone-shape" />
            {showBarLabels && <span className="gantt-bar-outside-label">{task.name}</span>}
          </div>
        )}

        {hasDates && !milestone && (
          <div
            className={[
              'gantt-bar',
              task.isSummary ? 'is-summary' : STATUS_MODIFIER[task.status] || 'is-not-started',
              critical ? 'is-critical' : '',
              dimmed ? 'is-dimmed' : '',
              task.isBlocked ? 'is-blocked' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: layout.xOf(startDate),
              width: layout.widthOf(startDate, endDate),
            }}
            onMouseDown={(e) => onBarMouseDown(e, task)}
            onMouseEnter={(e) => onBarEnter(e, task)}
            onMouseMove={onBarMove}
            onMouseLeave={onBarLeave}
          >
            <span
              className="gantt-bar-fill"
              style={{ width: `${clampProgress(task.progress)}%` }}
            />
            {showBarLabels && <BarLabel task={task} layout={layout} start={startDate} end={endDate} />}
            {!task.isSummary && (
              <span
                className="gantt-bar-handle"
                onMouseDown={(e) => onResizeMouseDown(e, task)}
                title="Arrastar para ajustar o término"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O rótulo vai DENTRO da barra quando cabe, e do lado de fora quando
 * não cabe. Antes ele simplesmente sumia em barras curtas.
 */
function BarLabel({ task, layout, start, end }) {
  const width = layout.widthOf(start, end);
  const fits = width > task.name.length * 6.2 + 20;

  return fits ? (
    <span className="gantt-bar-label">{task.name}</span>
  ) : (
    <span className="gantt-bar-outside-label">{task.name}</span>
  );
}
