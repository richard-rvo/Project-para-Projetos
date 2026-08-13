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
import ConfirmDialog from '../../components/ConfirmDialog';
import * as XLSX from 'xlsx';
import {
  AlertCircle, Calendar, Download, Plus, Settings, Target, Undo2, Redo2,
} from 'lucide-react';

import {
  addDays, daysBetween, durationDays, today, formatDateShort, clampProgress,
} from '../../utils/schedule';
import { calculateTaskPlannedProgress } from '../../utils/progress';
import {
  ZOOM_LEVELS, COLUMNS, DURATION_UNITS,
  DEFAULT_GRID_W, MIN_GRID_W, MAX_GRID_W,
  rowHeightFor, loadVisibleColumns, saveVisibleColumns,
} from './ganttConfig';
import {
  useProjectTasks, useAutoScheduling, useCriticalPath,
  viewStart, viewEnd, viewProgress, stripComputed,
} from './useGanttTasks';
import { useGanttLayout } from './useGanttLayout';
import { useGanttKeyboard } from './useGanttKeyboard';
import { useGanttLinking, linkTasks } from './useGanttLinking';
import GanttHeader from './GanttHeader';
import GanttRow from './GanttRow';
import GanttDependencies from './GanttDependencies';
import GanttTooltip from './GanttTooltip';
import GanttContextMenu from './GanttContextMenu';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function GanttView() {
  const {
    state, addTask, addTasks, updateTasksBatch, removeTasks, showToast,
    undo, redo, canUndo, canRedo, openTaskInspector,
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
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const clipboardRef = useRef([]);

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

  /* Barreira única de escrita: nada derivado (rollup, hasChildren,
     isSummary) chega ao IndexedDB. */
  const saveTasks = useCallback(
    (list, label) => updateTasksBatch(list.map(stripComputed), label),
    [updateTasksBatch]
  );

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

    /* Clicar move o cursor de teclado para a coluna clicada, para o
       usuário poder alternar mouse e teclado sem perder o lugar. */
    /* Clique em <div> não move foco sozinho. Trazemos o foco para a
       grade para que as setas e o Tab cheguem ao Gantt em vez de
       continuarem no último input tocado. */
    scrollerRef.current?.focus({ preventScroll: true });

    const colId = e.target.closest?.('[data-col]')?.getAttribute('data-col');
    setActiveCell({ taskId: task.id, colId: colId || 'name' });

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
    await saveTasks(reschedules ? applyAutoScheduling(modified, tasks) : [modified]);
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
      await saveTasks(applyAutoScheduling(modified, tasks));
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
    if (updates.length) await saveTasks(updates);
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
      await saveTasks(updates);
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

  /* ── Hierarquia ─────────────────────────────────────────────── */
  const targetTasks = useCallback(() => {
    if (selectedIds.size) return tasks.filter((t) => selectedIds.has(t.id));
    const active = tasks.find((t) => t.id === activeCell?.taskId);
    return active ? [active] : [];
  }, [tasks, selectedIds, activeCell]);

  const handleIndent = useCallback(async (delta) => {
    const targets = targetTasks();
    if (!targets.length) return;

    const updates = targets.map((task) => {
      const index = tasks.findIndex((t) => t.id === task.id);
      const prev = tasks[index - 1];
      /* Não dá para indentar além de um nível abaixo da linha acima —
         isso produziria um "filho" sem pai. */
      const ceiling = prev ? (prev.indentLevel || 0) + 1 : 0;
      const next = Math.max(0, Math.min(ceiling, (task.indentLevel || 0) + delta));
      return next === (task.indentLevel || 0) ? null : { ...task, indentLevel: next };
    }).filter(Boolean);

    if (updates.length) await saveTasks(updates, 'Alterar hierarquia');
  }, [tasks, targetTasks, updateTasksBatch]);

  /* ── Clipboard ──────────────────────────────────────────────── */
  const handleCopy = useCallback(() => {
    const targets = targetTasks();
    if (!targets.length) return;
    clipboardRef.current = targets.map((t) => ({ ...t }));
    showToast(`${targets.length} tarefa(s) copiada(s)`, 'info');
  }, [targetTasks, showToast]);

  const pasteTasks = useCallback(async (source) => {
    if (!source.length) return;
    /* Cópias entram sem dependências: os ids referenciados apontam
       para as tarefas originais e a cópia herdaria vínculos errados. */
    const clones = source.map((t, i) => ({
      ...t,
      id: generateId(),
      name: `${t.name} (cópia)`,
      dependsOn: '',
      order: tasks.length + i,
    }));
    await addTasks(clones);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [tasks.length, addTasks]);

  const handlePaste = useCallback(() => pasteTasks(clipboardRef.current), [pasteTasks]);
  const handleDuplicate = useCallback(() => pasteTasks(targetTasks()), [pasteTasks, targetTasks]);

  const handleDeleteSelected = useCallback(() => {
    const targets = targetTasks();
    if (!targets.length) return;
    setConfirmAction({
      title: targets.length > 1 ? 'Excluir tarefas' : 'Excluir tarefa',
      message: targets.length > 1
        ? `Excluir ${targets.length} tarefas selecionadas?`
        : `Excluir "${targets[0].name}"?`,
      onConfirm: async () => {
        await removeTasks(targets.map((t) => t.id));
        setSelectedIds(new Set());
      },
    });
  }, [targetTasks, removeTasks]);

  /* ── Ligação por arrasto ────────────────────────────────────── */
  const handleLink = useCallback(async (predecessor, successor) => {
    const result = linkTasks(predecessor, successor, tasks);
    if (!result.ok) {
      showToast(result.reason, 'error');
      return;
    }
    await saveTasks(applyAutoScheduling(result.task, tasks), 'Criar dependência');
  }, [tasks, applyAutoScheduling, updateTasksBatch, showToast]);

  const { linkDrag, beginLink } = useGanttLinking({
    tasks, scrollerRef, onLink: handleLink,
  });

  /* ── Arrastar progresso ─────────────────────────────────────── */
  const handleProgressDrag = useCallback((e, task) => {
    e.preventDefault();
    e.stopPropagation();
    const bar = e.currentTarget.parentElement;
    const box = bar.getBoundingClientRect();
    let next = clampProgress(task.progress);

    const onMove = (ev) => {
      next = clampProgress(Math.round(((ev.clientX - box.left) / box.width) * 100));
      /* Escrita imperativa: durante o arrasto não há re-render, então
         mover a alça pelo DOM mantém o gesto fluido. */
      bar.querySelector('.gantt-bar-fill').style.width = `${next}%`;
      e.target.style.left = `${next}%`;
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (next !== clampProgress(task.progress)) {
        await saveTasks([{ ...task, progress: next }], 'Ajustar progresso');
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateTasksBatch]);

  /* ── Menu de contexto ───────────────────────────────────────── */
  const handleContextMenu = useCallback((e, task) => {
    e.preventDefault();
    if (!selectedIds.has(task.id)) setSelectedIds(new Set([task.id]));
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  }, [selectedIds]);

  /* ── Teclado ────────────────────────────────────────────────── */
  useGanttKeyboard({
    enabled: !state.inspectorTaskId && !confirmAction,
    tasks, columns, activeCell, setActiveCell, editingCell,
    startEdit, commitEdit,
    cancelEdit: () => setEditingCell(null),
    selectedIds, setSelectedIds,
    onIndent: handleIndent,
    onDeleteSelected: handleDeleteSelected,
    onDuplicateSelected: handleDuplicate,
    onCopySelected: handleCopy,
    onPasteClipboard: handlePaste,
    onToggleCollapse: (id, collapse) => setCollapsedIds((prev) => {
      const next = new Set(prev);
      collapse ? next.add(id) : next.delete(id);
      return next;
    }),
  });

  if (!activeProject) return null;

  const ctx = {
    columns, gridWidth, layout, selectedIds, editingCell, collapsedIds,
    criticalIds, showCriticalPath, showBarLabels, dragPreview, dragOverIndex,
    editValue, editInputRef, formatDuration, predecessorLabel,
    activeCell,
    linkTargetId: linkDrag?.targetId || null,
    onBeginLink: beginLink,
    onProgressDrag: handleProgressDrag,
    onContextMenu: handleContextMenu,
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
    onOpenDetails: (task) => openTaskInspector(task.id),
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
        <ViewBarDivider />
        <ViewBarButton icon={Undo2} onClick={undo} disabled={!canUndo} title="Desfazer (⌘Z)" />
        <ViewBarButton icon={Redo2} onClick={redo} disabled={!canRedo} title="Refazer (⇧⌘Z)" />

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
        <div className="gantt-scroller" ref={scrollerRef} tabIndex={0}>
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

              {/* Linha elástica do arrasto de ligação */}
              {linkDrag && (
                <svg className="gantt-link-layer" aria-hidden="true">
                  <line
                    className="gantt-link-line"
                    x1={linkDrag.from.x}
                    y1={linkDrag.from.y}
                    x2={linkDrag.to.x}
                    y2={linkDrag.to.y}
                  />
                  <circle className="gantt-link-origin" cx={linkDrag.from.x} cy={linkDrag.from.y} r="4" />
                </svg>
              )}

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

      <GanttContextMenu
        data={contextMenu}
        onClose={() => setContextMenu(null)}
        selectionCount={selectedIds.size}
        actions={{
          openDetails: (task) => openTaskInspector(task.id),
          indent: handleIndent,
          copy: handleCopy,
          paste: handlePaste,
          duplicate: handleDuplicate,
          remove: handleDeleteSelected,
          clearDependencies: (task) =>
            saveTasks([{ ...task, dependsOn: '' }], 'Remover predecessoras'),
        }}
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
