import React, {
  useContext, useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { AppContext } from '../../context/AppContext';
import ViewBar, {
  ViewBarButton, ViewBarDivider, ViewBarSegments,
} from '../../components/shell/ViewBar';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import * as XLSX from 'xlsx';
import {
  AlertCircle, Calendar, Download, Plus, Settings, Target, Indent, Outdent, Trash2,
} from 'lucide-react';

import {
  addDays, daysBetween, durationDays, today, formatDateShort, clampProgress,
} from '../../utils/schedule';
import { calculateTaskPlannedProgress } from '../../utils/progress';
import {
  ZOOM_LEVELS, COLUMNS, STATUS_OPTIONS, DURATION_UNITS,
  DEFAULT_GRID_W, MIN_GRID_W, MAX_GRID_W,
  rowHeightFor, loadVisibleColumns, saveVisibleColumns,
} from './ganttConfig';
import { useProjectTasks, useAutoScheduling, useCriticalPath } from './useGanttTasks';
import { useGanttLayout } from './useGanttLayout';
import GanttHeader from './GanttHeader';
import GanttRow from './GanttRow';
import GanttDependencies from './GanttDependencies';
import GanttTooltip from './GanttTooltip';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function GanttView() {
  const {
    state, addTask, updateTask, updateTasksBatch, removeTask, showToast,
  } = useContext(AppContext);

  const rowH = rowHeightFor(state.density);

  /* ── Estado da view ─────────────────────────────────────────── */
  const [zoomId, setZoomId] = useState('day');
  const [gridWidth, setGridWidth] = useState(DEFAULT_GRID_W);
  const [visibleCols, setVisibleCols] = useState(loadVisibleColumns);
  const [showBarLabels, setShowBarLabels] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [modalTask, setModalTask] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const [scheduleSettings, setScheduleSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('gantt_schedule_settings')) || {
        durationUnit: 'days', hoursPerDay: 8,
      };
    } catch {
      return { durationUnit: 'days', hoursPerDay: 8 };
    }
  });

  const scrollerRef = useRef(null);
  const editInputRef = useRef(null);
  const newTaskRef = useRef(null);
  const didInitialScroll = useRef(false);

  const zoom = ZOOM_LEVELS.find((z) => z.id === zoomId) || ZOOM_LEVELS[0];
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const tasks = useProjectTasks(state.tasks, state.activeProjectId, collapsedIds);
  const applyAutoScheduling = useAutoScheduling();
  const criticalIds = useCriticalPath(tasks, showCriticalPath);
  const layout = useGanttLayout(tasks, zoom.dayWidth, zoom.tick);

  const columns = useMemo(
    () => COLUMNS.filter((c) => c.alwaysOn || visibleCols[c.id]),
    [visibleCols]
  );

  /* ── Ajuda de formatação ────────────────────────────────────── */
  const formatDuration = useCallback((days) => {
    const { durationUnit, hoursPerDay } = scheduleSettings;
    if (durationUnit === 'hours') return `${days * hoursPerDay}h`;
    if (durationUnit === 'minutes') return `${days * hoursPerDay * 60}m`;
    return `${days}d`;
  }, [scheduleSettings]);

  const parseDurationToDays = useCallback((value) => {
    const num = parseFloat(value) || 1;
    const { durationUnit, hoursPerDay } = scheduleSettings;
    if (durationUnit === 'hours') return Math.max(1, Math.ceil(num / hoursPerDay));
    if (durationUnit === 'minutes') return Math.max(1, Math.ceil(num / (hoursPerDay * 60)));
    return Math.max(1, Math.round(num));
  }, [scheduleSettings]);

  /* Predecessoras são exibidas como número de linha, não como id. */
  const predecessorLabel = useCallback((dependsOn) => {
    if (!dependsOn) return '';
    return String(dependsOn)
      .split(',')
      .map((id) => tasks.findIndex((t) => t.id === id.trim()))
      .filter((i) => i >= 0)
      .map((i) => i + 1)
      .join(', ');
  }, [tasks]);

  const predecessorFromLabel = useCallback((label) => {
    if (!label?.trim()) return '';
    return String(label)
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n))
      .map((n) => tasks[n - 1]?.id)
      .filter(Boolean)
      .join(',');
  }, [tasks]);

  /* ── Scroll inicial até hoje ──────────────────────────────────
     Só depois que as tarefas chegam. As tarefas vêm do IndexedDB de
     forma assíncrona, então no primeiro render a lista está vazia e
     a timeline é só o padrão em torno de hoje — posicionar ali e
     marcar como feito deixava o Gantt sempre aberto na ponta
     esquerda, longe do cronograma real. */
  useEffect(() => {
    if (didInitialScroll.current || !scrollerRef.current) return;
    if (!tasks.length || !layout.todayVisible) return;
    scrollerRef.current.scrollLeft = Math.max(0, layout.todayX - 260);
    didInitialScroll.current = true;
  }, [tasks.length, layout.todayX, layout.todayVisible]);

  /* Trocar de projeto reposiciona a timeline. */
  useEffect(() => {
    didInitialScroll.current = false;
  }, [state.activeProjectId]);

  useEffect(() => { saveVisibleColumns(visibleCols); }, [visibleCols]);

  /* ── Seleção ────────────────────────────────────────────────── */
  const handleRowMouseDown = useCallback((e, task, index) => {
    if (e.button !== 0) return;
    setSelectedIds((prev) => {
      if (e.shiftKey && prev.size) {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      }
      if (e.metaKey || e.ctrlKey) {
        const next = new Set(prev);
        next.has(task.id) ? next.delete(task.id) : next.add(task.id);
        return next;
      }
      return new Set([task.id]);
    });
  }, []);

  const toggleCollapse = useCallback((taskId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }, []);

  /* ── Edição inline ──────────────────────────────────────────── */
  const startEdit = useCallback((task, col) => {
    setEditingCell({ taskId: task.id, field: col.field, colId: col.id });
    if (col.id === 'dependencies') setEditValue(predecessorLabel(task.dependsOn));
    else if (col.id === 'duration') setEditValue(String(durationDays(task.startDate, task.endDate)));
    else setEditValue(task[col.field] ?? '');
  }, [predecessorLabel]);

  const commitEdit = useCallback(async () => {
    if (!editingCell) return;
    const task = tasks.find((t) => t.id === editingCell.taskId);
    if (!task) { setEditingCell(null); return; }

    let modified;
    if (editingCell.colId === 'duration') {
      const days = parseDurationToDays(editValue);
      modified = { ...task, endDate: addDays(task.startDate, days - 1) };
    } else if (editingCell.colId === 'dependencies') {
      modified = { ...task, dependsOn: predecessorFromLabel(editValue) };
    } else if (editingCell.colId === 'progress') {
      modified = { ...task, progress: clampProgress(editValue) };
    } else {
      modified = { ...task, [editingCell.field]: editValue };
    }

    /* Só o que mexe no cronograma dispara o forward pass. */
    const reschedules = ['duration', 'start', 'end', 'dependencies'].includes(editingCell.colId);
    await updateTasksBatch(reschedules ? applyAutoScheduling(modified, tasks) : [modified]);
    setEditingCell(null);
  }, [editingCell, editValue, tasks, parseDurationToDays, predecessorFromLabel, applyAutoScheduling, updateTasksBatch]);

  /* ── Arrastar barra ─────────────────────────────────────────── */
  const beginBarDrag = useCallback((e, task, mode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(new Set([task.id]));
    setTooltip(null);

    const startX = e.clientX;
    const origStart = task.startDate;
    const origEnd = task.endDate;
    let delta = 0;

    const onMove = (ev) => {
      const next = Math.round((ev.clientX - startX) / zoom.dayWidth);
      if (next === delta) return; // só re-renderiza ao virar o dia
      delta = next;
      setDragPreview(
        mode === 'move'
          ? { taskId: task.id, startDate: addDays(origStart, delta), endDate: addDays(origEnd, delta) }
          : { taskId: task.id, startDate: origStart, endDate: addDays(origEnd, delta) }
      );
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragPreview(null);
      if (delta === 0) return;

      const newStart = mode === 'move' ? addDays(origStart, delta) : origStart;
      const newEnd = addDays(origEnd, delta);
      if (newEnd < newStart) return; // resize não pode inverter a barra

      const modified = { ...task, startDate: newStart, endDate: newEnd };
      await updateTasksBatch(applyAutoScheduling(modified, tasks));
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [zoom.dayWidth, tasks, applyAutoScheduling, updateTasksBatch]);

  const handleBarMouseDown = useCallback((e, task) => {
    if (task.isSummary) return; // resumo é calculado, não arrastável
    beginBarDrag(e, task, 'move');
  }, [beginBarDrag]);

  const handleResizeMouseDown = useCallback((e, task) => {
    beginBarDrag(e, task, 'resize');
  }, [beginBarDrag]);

  /* ── Tooltip ────────────────────────────────────────────────── */
  const showTooltip = useCallback((e, task) => {
    const host = scrollerRef.current?.getBoundingClientRect();
    if (!host) return;
    setTooltip({
      task,
      x: e.clientX - host.left,
      y: e.clientY - host.top,
      flipX: e.clientX > window.innerWidth - 320,
    });
  }, []);

  const moveTooltip = useCallback((e) => {
    const host = scrollerRef.current?.getBoundingClientRect();
    if (!host) return;
    setTooltip((prev) => prev && {
      ...prev,
      x: e.clientX - host.left,
      y: e.clientY - host.top,
      flipX: e.clientX > window.innerWidth - 320,
    });
  }, []);

  /* ── Reordenar linhas ───────────────────────────────────────── */
  const handleRowDrop = useCallback(async (e, targetIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) { setDraggedIndex(null); return; }

    const reordered = [...tasks];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered
      .map((t, i) => (t.order !== i ? { ...t, order: i } : null))
      .filter(Boolean);
    if (updates.length) await updateTasksBatch(updates);
    setDraggedIndex(null);
  }, [draggedIndex, tasks, updateTasksBatch]);

  /* ── Splitter ───────────────────────────────────────────────── */
  const handleSplitterDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = gridWidth;
    const onMove = (ev) => {
      setGridWidth(Math.max(MIN_GRID_W, Math.min(MAX_GRID_W, startW + ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-col-resizing');
    };
    document.body.classList.add('is-col-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [gridWidth]);

  /* ── Ações ──────────────────────────────────────────────────── */
  const handleAddTask = useCallback(async (e) => {
    if (e.key !== 'Enter' || !newTaskName.trim()) return;
    const start = today();
    await addTask({
      id: generateId(),
      projectId: state.activeProjectId,
      name: newTaskName.trim(),
      startDate: start,
      endDate: addDays(start, 4),
      status: 'Não Iniciada',
      progress: 0,
      dependsOn: '',
      indentLevel: 0,
      order: tasks.length,
    });
    setNewTaskName('');
    setTimeout(() => newTaskRef.current?.focus(), 40);
  }, [newTaskName, state.activeProjectId, tasks.length, addTask]);

  const handleSaveBaseline = () => setConfirmAction({
    title: 'Salvar linha de base',
    message: 'Grava as datas atuais como linha de base de todas as tarefas deste projeto, substituindo qualquer baseline anterior.',
    onConfirm: async () => {
      const updates = tasks
        .filter((t) => t.startDate && t.endDate)
        .map((t) => ({ ...t, baselineStart: t.startDate, baselineEnd: t.endDate }));
      await updateTasksBatch(updates);
      showToast('Linha de base salva', 'success');
    },
  });

  const exportToExcel = () => {
    const header = ['#', 'Tarefa', 'Duração (d)', 'Início', 'Término', '% Concluída',
      '% Planejada', 'Início Baseline', 'Término Baseline', 'Recursos', 'Grupo', 'Predecessoras'];
    const rows = tasks.map((t, i) => [
      i + 1, t.name, durationDays(t.startDate, t.endDate),
      t.startDate || '', t.endDate || '', clampProgress(t.progress),
      calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd),
      t.baselineStart || '', t.baselineEnd || '',
      t.resources || '', t.resourceGroup || '', predecessorLabel(t.dependsOn),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Gantt');
    XLSX.writeFile(wb, `${activeProject?.name || 'Projeto'}_Gantt.xlsx`);
  };

  if (!activeProject) return null;

  const ctx = {
    columns, gridWidth, layout, selectedIds, editingCell, collapsedIds,
    criticalIds, showCriticalPath, showBarLabels, dragPreview, dragOverIndex,
    editValue, editInputRef, formatDuration, predecessorLabel,
    onRowMouseDown: handleRowMouseDown,
    onToggleCollapse: toggleCollapse,
    onStartEdit: startEdit,
    onEditChange: setEditValue,
    onCommitEdit: commitEdit,
    onCancelEdit: () => setEditingCell(null),
    onBarMouseDown: handleBarMouseDown,
    onResizeMouseDown: handleResizeMouseDown,
    onBarEnter: showTooltip,
    onBarMove: moveTooltip,
    onBarLeave: () => setTooltip(null),
    onOpenDetails: (task) => setModalTask({ ...task }),
    onRowDragStart: (e, i) => { setDraggedIndex(i); e.dataTransfer.effectAllowed = 'move'; },
    onRowDragOver: (e, i) => { e.preventDefault(); if (dragOverIndex !== i) setDragOverIndex(i); },
    onRowDrop: handleRowDrop,
    onRowDragEnd: () => { setDraggedIndex(null); setDragOverIndex(null); },
  };

  /* Fase da faixa de fim de semana: alinha o gradiente de 7 dias ao
     dia da semana em que a timeline começa. */
  const weekendPhase =
    ((new Date(`${layout.rangeStart}T00:00:00Z`).getUTCDay() + 6) % 7) * zoom.dayWidth;

  return (
    <div className="gantt-view">
      <ViewBar>
        <ViewBarSegments
          options={ZOOM_LEVELS.map((z) => ({ id: z.id, label: z.label }))}
          value={zoomId}
          onChange={setZoomId}
        />
        <ViewBarDivider />
        <ViewBarButton
          icon={AlertCircle}
          active={showCriticalPath}
          onClick={() => setShowCriticalPath((v) => !v)}
          title="Destacar tarefas sem folga"
        >
          Caminho crítico
        </ViewBarButton>
        <ViewBarButton icon={Target} onClick={handleSaveBaseline} title="Gravar as datas atuais">
          Baseline
        </ViewBarButton>

        <div className="ml-auto" />

        <ViewBarButton icon={Download} onClick={exportToExcel}>Excel</ViewBarButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ViewBarButton icon={Calendar}>Cronograma</ViewBarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
              Unidade de duração
            </DropdownMenuLabel>
            {DURATION_UNITS.map((u) => (
              <DropdownMenuCheckboxItem
                key={u.id}
                checked={scheduleSettings.durationUnit === u.id}
                onCheckedChange={() => {
                  const next = { ...scheduleSettings, durationUnit: u.id };
                  setScheduleSettings(next);
                  localStorage.setItem('gantt_schedule_settings', JSON.stringify(next));
                }}
              >
                {u.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ViewBarButton icon={Settings}>Colunas</ViewBarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
              Colunas da planilha
            </DropdownMenuLabel>
            {COLUMNS.filter((c) => !c.alwaysOn).map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={!!visibleCols[col.id]}
                onCheckedChange={(v) => setVisibleCols((p) => ({ ...p, [col.id]: v }))}
                onSelect={(e) => e.preventDefault()}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showBarLabels}
              onCheckedChange={setShowBarLabels}
              onSelect={(e) => e.preventDefault()}
            >
              Rótulos nas barras
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ViewBarButton icon={Plus} variant="primary" onClick={() => newTaskRef.current?.focus()}>
          Tarefa
        </ViewBarButton>
      </ViewBar>

      {/* ── Corpo: UM scroller para os dois eixos ───────────────── */}
      <div className="gantt-body">
        <div className="gantt-scroller" ref={scrollerRef}>
          <div
            className="gantt-canvas"
            style={{
              '--gantt-grid-w': `${gridWidth}px`,
              '--gantt-day-w': `${zoom.dayWidth}px`,
              '--gantt-week-w': `${zoom.dayWidth * 7}px`,
              '--gantt-weekend-phase': `${-weekendPhase}px`,
              width: gridWidth + layout.totalWidth,
            }}
          >
            <GanttHeader
              columns={columns}
              gridWidth={gridWidth}
              layout={layout}
              zoom={zoom}
            />

            <div className="gantt-rows">
              {/* Fundo da timeline: gradientes em vez de um div por dia */}
              <div
                className={`gantt-grid-bg ${zoom.tick === 'day' ? 'has-day-lines' : ''}`}
                style={{ left: gridWidth, width: layout.totalWidth }}
              />

              {layout.months.map((m) => (
                <div
                  key={`sep-${m.key}`}
                  className="gantt-month-sep"
                  style={{ left: gridWidth + m.startIndex * zoom.dayWidth }}
                />
              ))}

              {layout.todayVisible && (
                <div className="gantt-today-line" style={{ left: gridWidth + layout.todayX }} />
              )}

              <GanttDependencies
                tasks={tasks}
                layout={layout}
                rowH={rowH}
                criticalIds={criticalIds}
                showCriticalPath={showCriticalPath}
                selectedId={selectedIds.size === 1 ? [...selectedIds][0] : null}
              />

              {tasks.map((task, index) => (
                <GanttRow key={task.id} task={task} index={index} ctx={ctx} />
              ))}

              {/* Linha de entrada rápida */}
              <div className="gantt-row is-new">
                <div className="gantt-row-grid" style={{ width: gridWidth }}>
                  <div className="gantt-cell gantt-cell-index">
                    <Plus size={12} className="text-text-3" />
                  </div>
                  <div className="gantt-cell is-left" style={{ flex: '1 1 auto' }}>
                    <input
                      ref={newTaskRef}
                      className="gantt-new-input"
                      placeholder="Nova tarefa — Enter para adicionar"
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      onKeyDown={handleAddTask}
                    />
                  </div>
                </div>
                <div className="gantt-row-time" style={{ width: layout.totalWidth }} />
              </div>
            </div>
          </div>
        </div>

        {/* Alça do splitter: fora do scroller, então não rola junto */}
        <div
          className="gantt-splitter"
          style={{ left: gridWidth }}
          onMouseDown={handleSplitterDown}
          role="separator"
          aria-orientation="vertical"
          title="Arraste para redimensionar a planilha"
        />

        <GanttTooltip data={tooltip} />
      </div>

      <TaskDetailsModal
        task={modalTask}
        onChange={setModalTask}
        onClose={() => setModalTask(null)}
        onSave={async () => {
          await updateTasksBatch(applyAutoScheduling(modalTask, tasks));
          setModalTask(null);
        }}
        onDelete={() => setConfirmAction({
          title: 'Excluir tarefa',
          message: `Excluir "${modalTask.name}"? A ação não pode ser desfeita.`,
          onConfirm: async () => { await removeTask(modalTask.id); setModalTask(null); },
        })}
        predecessorLabel={predecessorLabel}
        predecessorFromLabel={predecessorFromLabel}
      />

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm?.()}
        title={confirmAction?.title}
        message={confirmAction?.message}
      />
    </div>
  );
}

/* ── Modal de detalhes ────────────────────────────────────────────
   Temporário: a Fase 4 troca por um Inspector único, eliminando o
   terceiro caminho de edição.                                     */

function TaskDetailsModal({
  task, onChange, onClose, onSave, onDelete, predecessorLabel, predecessorFromLabel,
}) {
  if (!task) return null;
  const set = (patch) => onChange({ ...task, ...patch });

  return (
    <Modal isOpen={!!task} onClose={onClose} title="Detalhes da tarefa">
      <div className="modal-body">
        <div className="form-group">
          <label>Nome</label>
          <input value={task.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Início</label>
            <input type="date" value={task.startDate || ''} onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Término</label>
            <input type="date" value={task.endDate || ''} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Progresso (%)</label>
            <input type="number" min="0" max="100" value={task.progress ?? 0}
              onChange={(e) => set({ progress: clampProgress(e.target.value) })} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={task.status || ''} onChange={(e) => set({ status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Predecessoras (números de linha)</label>
          <input placeholder="Ex: 1, 3" value={predecessorLabel(task.dependsOn)}
            onChange={(e) => set({ dependsOn: predecessorFromLabel(e.target.value) })} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Recursos</label>
            <input value={task.resources || ''} onChange={(e) => set({ resources: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Grupo</label>
            <input value={task.resourceGroup || ''} onChange={(e) => set({ resourceGroup: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Hierarquia (nível {task.indentLevel || 0})</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-secondary btn-sm"
              onClick={() => set({ indentLevel: Math.max(0, (task.indentLevel || 0) - 1) })}>
              <Outdent size={14} /> Recuar
            </button>
            <button type="button" className="btn-secondary btn-sm"
              onClick={() => set({ indentLevel: (task.indentLevel || 0) + 1 })}>
              <Indent size={14} /> Avançar
            </button>
          </div>
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button className="btn-icon-only btn-danger-ghost" title="Excluir tarefa" onClick={onDelete}>
            <Trash2 size={18} />
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={onSave}>Salvar</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
