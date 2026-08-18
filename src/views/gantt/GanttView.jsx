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
  AlertCircle, Download, Plus, Target, Undo2, Redo2, Hourglass, Maximize2, Tag,
} from 'lucide-react';

import {
  addDays, daysBetween, durationDays, today, formatDateShort,
  formatDateTimeShort, clampProgress, isManual, SCHEDULE_MODES,
} from '../../utils/schedule';
import {
  calendarOf, calendarsOf, defaultCalendarOf, workdayStart, workdayEnd,
} from '../../utils/calendar';
import {
  addWorkingMinutes, workingMinutesBetween, snapForward, minutesPerDay,
} from '../../utils/worktime';
import { formatDuration, resolveDuration } from '../../utils/duration';
import { calculateTaskPlannedProgress } from '../../utils/progress';
import {
  ZOOM_LEVELS, COLUMNS,
  DEFAULT_GRID_W, MIN_GRID_W, MAX_GRID_W,
  rowHeightFor, HEADER_H,
  MIN_DAY_W, MAX_DAY_W, tickForDayWidth, nearestZoomId,
  loadColumnLayout, saveColumnLayout, MIN_COL_W, MAX_COL_W,
  SUBDAY_MIN_DAY_W, DRAG_SNAP_MINUTES,
} from './ganttConfig';
import {
  useProjectTasks, useAutoScheduling, useScheduleAnalysis,
  viewStart, viewEnd, viewProgress, stripComputed,
} from './useGanttTasks';
import {
  readDependencies, parseDependencyInput, formatDependency, wouldCreateCycle,
} from '../../utils/dependencies';
import { useGanttLayout } from './useGanttLayout';
import { useGanttKeyboard } from './useGanttKeyboard';
import {
  useScrollViewport, useVirtualRows, useVirtualDays, useZoomOnWheel,
} from './useGanttViewport';
import GanttHeader from './GanttHeader';
import GanttRow from './GanttRow';
import GanttDependencies from './GanttDependencies';
import GanttTooltip from './GanttTooltip';
import GanttContextMenu from './GanttContextMenu';
import GanttCalendarMenu from './GanttCalendarMenu';
import GanttFilterMenu from './GanttFilterMenu';
import GanttColumnMenu from './GanttColumnMenu';
import GanttGroupRow from './GanttGroupRow';
import GanttMinimap from './GanttMinimap';
import { useGanttRows, EMPTY_FILTERS } from './useGanttFilters';

const EMPTY_SET = new Set();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function GanttView() {
  const {
    state, addTask, addTasks, updateTasksBatch, removeTasks, showToast, updateProject,
    undo, redo, canUndo, canRedo, openTaskInspector,
  } = useContext(AppContext);

  const rowH = rowHeightFor(state.density);

  /* ── Estado da view ─────────────────────────────────────────── */
  const [dayWidth, setDayWidth] = useState(32);
  const [gridWidth, setGridWidth] = useState(DEFAULT_GRID_W);
  const [layoutCols, setLayoutCols] = useState(() => loadColumnLayout(null));
  const [columnMenu, setColumnMenu] = useState(null);
  const [showBarLabels, setShowBarLabels] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showSlack, setShowSlack] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

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

  const scrollerRef = useRef(null);
  const editInputRef = useRef(null);
  const newTaskRef = useRef(null);
  const didInitialScroll = useRef(false);

  const zoom = useMemo(
    () => ({ dayWidth, tick: tickForDayWidth(dayWidth), id: nearestZoomId(dayWidth) }),
    [dayWidth]
  );
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  /* ── Calendário ─────────────────────────────────────────────────
     Cada tarefa pode ter o seu, então tudo que fala de tempo passa
     por `calendarFor` — nunca pelo calendário do projeto direto.
     Fica no topo porque a geometria e a duração dependem dele. */
  const calendars = useMemo(() => calendarsOf(activeProject), [activeProject]);
  const projectCalendar = useMemo(() => defaultCalendarOf(activeProject), [activeProject]);

  const calendarFor = useCallback(
    (task) => calendarOf(activeProject, task),
    [activeProject]
  );

  const tasks = useProjectTasks(state.tasks, state.activeProjectId, collapsedIds, activeProject);
  const applyAutoScheduling = useAutoScheduling(activeProject);

  /* Análise CPM completa: sempre calculada, porque a folga alimenta a
     barra fantasma mesmo com o caminho crítico desligado. */
  const analysis = useScheduleAnalysis(tasks, activeProject);
  const criticalIds = showCriticalPath ? analysis.criticalIds : EMPTY_SET;
  const layout = useGanttLayout(tasks, zoom.dayWidth, zoom.tick, calendarFor);

  /* ── Virtualização ──────────────────────────────────────────
     Sem isto, 1.000 tarefas montam ~30.000 nós e o scroll morre. */
  /* As linhas exibidas vêm do filtro; cabeçalho de grupo é uma linha
     como outra qualquer, então a virtualização não precisa saber que
     ele existe. */
  const { rows, filteredOut } = useGanttRows(tasks, filters, analysis.criticalIds);

  /* Índice por id: com filtro ou agrupamento a posição visual deixa de
     ser o índice no array de tarefas, e as setas apontariam errado. */
  const rowIndexById = useMemo(() => {
    const map = new Map();
    rows.forEach((r, i) => { if (r.kind === 'task') map.set(r.id, i); });
    return map;
  }, [rows]);

  const viewport = useScrollViewport(scrollerRef);
  const vRows = useVirtualRows(viewport, rows.length, rowH, HEADER_H);
  const vDays = useVirtualDays(viewport, gridWidth, zoom.dayWidth, layout.totalDays);

  /* Barreira única de escrita: nada derivado (rollup, hasChildren,
     isSummary) chega ao IndexedDB. */
  const saveTasks = useCallback(
    (list, label) => updateTasksBatch(list.map(stripComputed), label),
    [updateTasksBatch]
  );

  /* A ordem é a fonte de verdade: quem está nela aparece, na posição
     em que está. Visibilidade e ordem deixam de ser dois estados que
     podem discordar. */
  const columns = useMemo(() => layoutCols.order
    .map((id) => COLUMNS.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => (layoutCols.widths[c.id] ? { ...c, width: layoutCols.widths[c.id] } : c)),
  [layoutCols]);

  const hiddenColumns = useMemo(
    () => COLUMNS.filter((c) => !layoutCols.order.includes(c.id)),
    [layoutCols]
  );

  /* Layout é por projeto: cada cronograma tem nomes de tamanho e
     colunas de interesse diferentes. */
  useEffect(() => {
    setLayoutCols(loadColumnLayout(state.activeProjectId));
  }, [state.activeProjectId]);

  const commitLayout = useCallback((next) => {
    setLayoutCols(next);
    saveColumnLayout(state.activeProjectId, next);
  }, [state.activeProjectId]);

  const handleResizeColumn = useCallback((e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = col.width;

    const onMove = (ev) => {
      const next = Math.max(MIN_COL_W, Math.min(MAX_COL_W, startW + ev.clientX - startX));
      setLayoutCols((prev) => ({ ...prev, widths: { ...prev.widths, [col.id]: next } }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-col-resizing');
      setLayoutCols((prev) => { saveColumnLayout(state.activeProjectId, prev); return prev; });
    };
    document.body.classList.add('is-col-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [state.activeProjectId]);

  /* ── Duração ────────────────────────────────────────────────── */
  /* Duração em MINUTOS ÚTEIS do calendário da tarefa. É a única
     unidade que soma certo entre uma tarefa de 8h/dia e outra de
     24h/dia na mesma cadeia. */
  const durationMinutesOf = useCallback(
    (task) => workingMinutesBetween(calendarFor(task), viewStart(task), viewEnd(task)),
    [calendarFor]
  );

  const durationLabel = useCallback(
    (task) => formatDuration(durationMinutesOf(task), calendarFor(task)),
    [durationMinutesOf, calendarFor]
  );

  const calendarLabel = useCallback(
    (task) => (task.calendarId ? calendarFor(task).name : ''),
    [calendarFor]
  );

  const formatMinutes = useCallback(
    (minutes) => formatDuration(minutes, projectCalendar),
    [projectCalendar]
  );

  /* Predecessoras são exibidas como número de linha, não como id. */
  /* "2FS+3" — número da linha, tipo e defasagem, como no MS Project. */
  const predecessorLabel = useCallback((dependsOn) => {
    return readDependencies(dependsOn)
      .map((dep) => {
        const index = tasks.findIndex((t) => t.id === dep.id);
        return index >= 0 ? formatDependency(dep, index + 1) : null;
      })
      .filter(Boolean)
      .join(', ');
  }, [tasks]);

  const predecessorFromLabel = useCallback(
    (label, selfId) => parseDependencyInput(label, tasks, selfId)
      .filter((dep) => !wouldCreateCycle(dep.id, selfId, tasks)),
    [tasks]
  );

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

  /* Ajusta a largura do dia para o projeto inteiro caber na tela. */
  const fitToProject = useCallback(() => {
    const available = (scrollerRef.current?.clientWidth || 0) - gridWidth - 24;
    if (available <= 0 || !layout.totalDays) return;
    const next = Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, available / layout.totalDays));
    setDayWidth(next);
    requestAnimationFrame(() => { if (scrollerRef.current) scrollerRef.current.scrollLeft = 0; });
  }, [gridWidth, layout.totalDays]);

  /* ⌘+scroll mantém sob o cursor o mesmo dia que estava lá antes —
     zoom que salta para outro ponto do calendário desorienta. */
  const zoomAtCursor = useCallback((direction, clientX) => {
    const el = scrollerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const anchorPx = clientX - box.left + el.scrollLeft - gridWidth;

    setDayWidth((prev) => {
      const next = Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, prev * (direction > 0 ? 1.15 : 1 / 1.15)));
      const anchorDay = anchorPx / prev;
      requestAnimationFrame(() => {
        if (scrollerRef.current) {
          scrollerRef.current.scrollLeft += anchorDay * (next - prev);
        }
      });
      return next;
    });
  }, [gridWidth]);

  useZoomOnWheel(scrollerRef, zoomAtCursor);

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
  /* O editor abre com a MESMA unidade que o commit vai gravar. Abrir
     em dias corridos e gravar em dias úteis — o que acontecia aqui —
     empurrava uma tarefa seg–sex para a semana seguinte só de abrir a
     célula e apertar Enter. */
  const startEdit = useCallback((task, col) => {
    setEditingCell({ taskId: task.id, field: col.field, colId: col.id });
    if (col.id === 'dependencies') setEditValue(predecessorLabel(task.dependsOn));
    else if (col.id === 'duration') setEditValue(durationLabel(task));
    else if (col.id === 'mode') setEditValue(isManual(task) ? SCHEDULE_MODES.MANUAL : SCHEDULE_MODES.AUTO);
    else setEditValue(task[col.field] ?? '');
  }, [predecessorLabel, durationLabel]);

  const commitEdit = useCallback(async () => {
    if (!editingCell) return;
    const task = tasks.find((t) => t.id === editingCell.taskId);
    if (!task) { setEditingCell(null); return; }

    const cal = calendarFor(task);
    const duration = workingMinutesBetween(cal, task.startDate, task.endDate);
    let modified;
    let becameManual = false;

    switch (editingCell.colId) {
      case 'duration': {
        const minutes = resolveDuration(editValue, cal, duration);
        modified = minutes === null || minutes === duration
          ? task
          : { ...task, endDate: addWorkingMinutes(cal, task.startDate, minutes) };
        break;
      }

      case 'start': {
        /* Editar o início DESLOCA a tarefa preservando a duração.
           Antes gravava só o campo, então a tarefa mudava de duração
           em vez de andar — e o término ficava onde estava. */
        const start = snapForward(cal, editValue);
        if (!start) { modified = task; break; }
        modified = { ...task, startDate: start, endDate: addWorkingMinutes(cal, start, duration) };
        /* Fixar o início à mão numa tarefa que TEM predecessora é uma
           decisão sobre o cronograma, não sobre esta tarefa: sem virar
           manual, o próximo recálculo desfaria a digitação em silêncio. */
        if (!isManual(task) && readDependencies(task.dependsOn).length) {
          modified.scheduleMode = SCHEDULE_MODES.MANUAL;
          becameManual = true;
        }
        break;
      }

      case 'end': {
        /* O término muda a DURAÇÃO, mantendo o início. */
        const finish = editValue;
        modified = finish && finish > task.startDate
          ? { ...task, endDate: finish }
          : task;
        break;
      }

      case 'dependencies':
        modified = { ...task, dependsOn: predecessorFromLabel(editValue, task.id) };
        break;

      case 'progress':
        modified = { ...task, progress: clampProgress(editValue) };
        break;

      case 'mode':
        modified = { ...task, scheduleMode: editValue || SCHEDULE_MODES.AUTO };
        break;

      case 'calendar': {
        /* Trocar de calendário mantém o INÍCIO e a duração em dias, e
           recalcula o término: "3 dias" num calendário 24h termina
           antes de "3 dias" num de 8h, e é isso que o planejador quer
           ver ao mudar a equipe da tarefa. */
        const next = calendarOf(activeProject, { calendarId: editValue });
        const days = duration / minutesPerDay(cal);
        const start = snapForward(next, task.startDate);
        modified = {
          ...task,
          calendarId: editValue || undefined,
          startDate: start,
          endDate: addWorkingMinutes(next, start, days * minutesPerDay(next)),
        };
        break;
      }

      default:
        modified = { ...task, [editingCell.field]: editValue };
    }

    /* Só o que mexe no cronograma dispara o forward pass. */
    const reschedules = ['duration', 'start', 'end', 'dependencies', 'mode', 'calendar']
      .includes(editingCell.colId);
    await saveTasks(reschedules ? applyAutoScheduling(modified, tasks) : [modified]);
    setEditingCell(null);

    if (becameManual) {
      showToast('Tarefa agendada manualmente — não será movida pelas predecessoras', 'info');
    }
  }, [
    editingCell, editValue, tasks, calendarFor, activeProject,
    predecessorFromLabel, applyAutoScheduling, updateTasksBatch, showToast,
  ]);

  /* ── Arrastar barra ───────────────────────────────────────────
     O deslocamento é contado em MINUTOS ÚTEIS do calendário da tarefa,
     não em dias corridos. Somar dias corridos deixava a barra parar no
     sábado ou num feriado — uma data que o motor jamais produziria
     sozinho, e que o próximo recálculo corrigia sozinho, dando a
     impressão de que o arrasto "não pegou". */
  const beginBarDrag = useCallback((e, task, mode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(new Set([task.id]));
    setTooltip(null);

    const cal = calendarFor(task);
    const perDay = minutesPerDay(cal);
    const subday = zoom.dayWidth >= SUBDAY_MIN_DAY_W;
    const startX = e.clientX;
    const origStart = task.startDate;
    const origEnd = task.endDate;
    const duration = workingMinutesBetween(cal, origStart, origEnd);
    let delta = 0;

    const deltaAt = (clientX) => {
      const days = (clientX - startX) / zoom.dayWidth;
      return subday
        ? Math.round((days * perDay) / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES
        : Math.round(days) * perDay;
    };

    const previewFor = (minutes) => {
      if (mode === 'move') {
        const start = addWorkingMinutes(cal, origStart, minutes);
        return { taskId: task.id, startDate: start, endDate: addWorkingMinutes(cal, start, duration) };
      }
      return { taskId: task.id, startDate: origStart, endDate: addWorkingMinutes(cal, origEnd, minutes) };
    };

    const onMove = (ev) => {
      const next = deltaAt(ev.clientX);
      if (next === delta) return; // só re-renderiza quando o valor muda
      delta = next;
      setDragPreview(previewFor(delta));
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragPreview(null);
      if (delta === 0) return;

      const { startDate, endDate } = previewFor(delta);
      if (endDate < startDate) return; // resize não pode inverter a barra

      const modified = { ...task, startDate, endDate };
      let becameManual = false;
      if (mode === 'move' && !isManual(task) && readDependencies(task.dependsOn).length) {
        modified.scheduleMode = SCHEDULE_MODES.MANUAL;
        becameManual = true;
      }

      await saveTasks(applyAutoScheduling(modified, tasks));
      if (becameManual) {
        showToast('Tarefa agendada manualmente — não será movida pelas predecessoras', 'info');
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [zoom.dayWidth, tasks, calendarFor, applyAutoScheduling, updateTasksBatch, showToast]);

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
    /* Nasce AUTOMÁTICA e com jornada: começa na abertura do próximo
       dia útil e dura 5 dias do calendário padrão do projeto. */
    const start = workdayStart(projectCalendar, today());
    await addTask({
      id: generateId(),
      projectId: state.activeProjectId,
      name: newTaskName.trim(),
      startDate: start,
      endDate: addWorkingMinutes(projectCalendar, start, 5 * minutesPerDay(projectCalendar)),
      scheduleMode: SCHEDULE_MODES.AUTO,
      status: 'Não Iniciada',
      progress: 0,
      dependsOn: [],
      indentLevel: 0,
      order: tasks.length,
    });
    setNewTaskName('');
    setTimeout(() => newTaskRef.current?.focus(), 40);
  }, [newTaskName, state.activeProjectId, tasks.length, addTask, projectCalendar]);

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
    const header = ['#', 'Tarefa', 'Duração', 'Início', 'Término', 'Modo', 'Calendário',
      '% Concluída', '% Planejada', 'Início Baseline', 'Término Baseline',
      'Recursos', 'Grupo', 'Predecessoras'];
    const rows = tasks.map((t, i) => [
      i + 1, t.name, durationLabel(t),
      formatDateTimeShort(t.startDate), formatDateTimeShort(t.endDate),
      isManual(t) ? 'Manual' : 'Automática', calendarFor(t).name,
      clampProgress(t.progress),
      calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd),
      formatDateTimeShort(t.baselineStart), formatDateTimeShort(t.baselineEnd),
      t.resources || '', t.resourceGroup || '', predecessorLabel(t.dependsOn),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Gantt');
    XLSX.writeFile(wb, `${activeProject?.name || 'Projeto'}_Gantt.xlsx`);
  };

  /* ── Colunas (modelo MS Project) ─────────────────────────────
     Gerenciadas no próprio cabeçalho: botão direito na coluna,
     "+" no fim da planilha. Acrescentar uma coluna ALARGA a
     planilha em vez de roubar espaço do nome da tarefa — era o que
     fazia o antigo dropdown parecer quebrado. */
  const columnActions = useMemo(() => ({
    hide: (id) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (!col || col.alwaysOn) return;
      commitLayout({ ...layoutCols, order: layoutCols.order.filter((x) => x !== id) });
      setGridWidth((w) => Math.max(MIN_GRID_W, w - (layoutCols.widths[id] || col.width)));
    },
    append: (id) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (!col || layoutCols.order.includes(id)) return;
      commitLayout({ ...layoutCols, order: [...layoutCols.order, id] });
      setGridWidth((w) => Math.min(MAX_GRID_W, w + col.width));
    },
    insert: (id, anchorId, side) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (!col || layoutCols.order.includes(id)) return;
      const next = [...layoutCols.order];
      const at = next.indexOf(anchorId);
      next.splice(side === 'before' ? Math.max(1, at) : at + 1, 0, id);
      commitLayout({ ...layoutCols, order: next });
      setGridWidth((w) => Math.min(MAX_GRID_W, w + col.width));
    },
    autoFit: (id) => {
      /* Mede o conteúdo real das células desta coluna. */
      const cells = document.querySelectorAll(`[data-col="${id}"] .gantt-cell-text`);
      let widest = 0;
      cells.forEach((el) => { widest = Math.max(widest, el.scrollWidth); });
      const next = Math.max(MIN_COL_W, Math.min(MAX_COL_W, widest + 24));
      commitLayout({ ...layoutCols, widths: { ...layoutCols.widths, [id]: next } });
    },
  }), [layoutCols, commitLayout]);

  const openColumnMenu = useCallback((e, col) => {
    e.preventDefault();
    setColumnMenu({ x: e.clientX, y: e.clientY, column: col, available: hiddenColumns });
  }, [hiddenColumns]);

  const openAddColumn = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setColumnMenu({ x: r.left, y: r.bottom + 4, mode: 'add', available: hiddenColumns });
  }, [hiddenColumns]);

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
      dependsOn: [],
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
    editValue, editInputRef, predecessorLabel,
    durationLabel, calendarLabel, calendarFor, formatMinutes,
    calendars, projectCalendarName: projectCalendar.name,
    analysis,
    showSlack,
    activeCell,
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
          value={zoom.id}
          onChange={(id) => setDayWidth(ZOOM_LEVELS.find((z) => z.id === id).dayWidth)}
        />
        <ViewBarButton icon={Maximize2} onClick={fitToProject} title="Ajustar o projeto inteiro à tela">
          Ajustar
        </ViewBarButton>
        <ViewBarDivider />
        <ViewBarButton
          icon={AlertCircle}
          active={showCriticalPath}
          onClick={() => setShowCriticalPath((v) => !v)}
          title="Destacar tarefas sem folga"
        >
          Caminho crítico
        </ViewBarButton>
        <ViewBarButton
          icon={Hourglass}
          active={showSlack}
          onClick={() => setShowSlack((v) => !v)}
          title="Mostrar folga total de cada tarefa"
        >
          Folga
        </ViewBarButton>
        <ViewBarButton icon={Target} onClick={handleSaveBaseline} title="Gravar as datas atuais">
          Baseline
        </ViewBarButton>
        <ViewBarDivider />
        <ViewBarButton icon={Undo2} onClick={undo} disabled={!canUndo} title="Desfazer (⌘Z)" />
        <ViewBarButton icon={Redo2} onClick={redo} disabled={!canRedo} title="Refazer (⇧⌘Z)" />

        <div className="ml-auto" />

        <GanttFilterMenu filters={filters} onChange={setFilters} filteredOut={filteredOut} />
        <ViewBarButton icon={Download} onClick={exportToExcel}>Excel</ViewBarButton>

        <GanttCalendarMenu
          project={activeProject}
          onChange={(patch) => updateProject({ ...activeProject, ...patch })}
        />

        <ViewBarButton
          icon={Tag}
          active={showBarLabels}
          onClick={() => setShowBarLabels((v) => !v)}
          title="Mostrar o nome da tarefa nas barras"
        >
          Rótulos
        </ViewBarButton>

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
              visibleDays={vDays}
              onResizeColumn={handleResizeColumn}
              onColumnMenu={openColumnMenu}
              onAddColumn={openAddColumn}
              canAddColumn={hiddenColumns.length > 0}
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
                visibleRange={vRows}
                rowIndexById={rowIndexById}
              />

              {/* Spacers em vez de transform: transform criaria um novo
                  bloco de contenção e quebraria o sticky da planilha. */}
              {vRows.padTop > 0 && <div style={{ height: vRows.padTop }} aria-hidden="true" />}

              {rows.slice(vRows.start, vRows.end).map((row, i) =>
                row.kind === 'group' ? (
                  <GanttGroupRow
                    key={row.id}
                    row={row}
                    gridWidth={gridWidth}
                    layout={layout}
                  />
                ) : (
                  <GanttRow
                    key={row.id}
                    task={row.task}
                    index={vRows.start + i}
                    ctx={ctx}
                  />
                )
              )}

              {vRows.padBottom > 0 && <div style={{ height: vRows.padBottom }} aria-hidden="true" />}

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

        <GanttTooltip data={tooltip} ctx={ctx} />
      </div>

      <GanttMinimap
        tasks={tasks}
        layout={layout}
        viewport={viewport}
        gridWidth={gridWidth}
        scrollerRef={scrollerRef}
      />

      <GanttColumnMenu
        data={columnMenu}
        onClose={() => setColumnMenu(null)}
        actions={columnActions}
      />

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
            saveTasks([{ ...task, dependsOn: [] }], 'Remover predecessoras'),
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
