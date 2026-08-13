import React, { useContext, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import Badge from '../components/Badge';
import ProgressBar from '../components/ProgressBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, Trash2, ZoomIn, ZoomOut, ChevronRight, GripVertical,
  ChevronDown, ChevronRight as ChevronRightIcon, Calendar, Milestone,
  Undo2, Redo2, ArrowDownUp, Link2, Eye, Target, AlertCircle, 
  Indent, Outdent, Download, Settings
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ViewBar, {
  ViewBarButton,
  ViewBarDivider,
  ViewBarSegments,
} from '../components/shell/ViewBar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { calculateTaskPlannedProgress } from '../utils/progress';
import {
  daysBetween,
  addDays,
  today,
  durationDays,
  formatDateShort,
  getMonthLabel,
  getDayOfWeekChar,
} from '../utils/schedule';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── zoom configs ────────────────────────────────────────────── */
const ZOOM_LEVELS = [
  { id: 'day', label: 'Dia', dayWidth: 36 },
  { id: 'week', label: 'Semana', dayWidth: 18 },
  { id: 'month', label: 'Mês', dayWidth: 5 },
];

/* ── status config ───────────────────────────────────────────── */
const STATUS_OPTIONS = ['Não Iniciada', 'Em Andamento', 'Concluída', 'Atrasada'];

/* Cor de status vem dos tokens de estado de cronograma — nunca de
   literal hex. Trocar o tema troca a barra junto. */
const STATUS_COLORS = {
  'Não Iniciada': 'var(--sched-not-started)',
  'Em Andamento': 'var(--sched-on-track)',
  'Concluída': 'var(--sched-done)',
  'Atrasada': 'var(--sched-late)',
};

const COLOR_CRITICAL = 'var(--sched-critical)';
const COLOR_DEP_LINE = 'var(--sched-baseline)';

const DURATION_UNITS = [
  { id: 'days', label: 'Dias' },
  { id: 'hours', label: 'Horas' },
  { id: 'minutes', label: 'Minutos' },
];

const COLUMN_LABELS = {
  duration: 'Duração',
  start: 'Início',
  end: 'Término',
  progress: '% Concluída',
  planned: '% Planejada',
  baselineStart: 'Início Baseline',
  baselineEnd: 'Término Baseline',
  dependencies: 'Predecessoras',
  resources: 'Recursos',
  resourceGroup: 'Grupo de Recurso',
};

export default function PageGantt() {
  const { state, addTask, updateTask, updateTasksBatch, removeTask, showToast, openTaskInspector } = useContext(AppContext);
  const [zoomIdx, setZoomIdx] = useState(0); // start at day level
  const [splitWidth, setSplitWidth] = useState(660);
  const [editingCell, setEditingCell] = useState(null); // { taskId, field }
  const [editValue, setEditValue] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [draggingTask, setDraggingTask] = useState(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [draggedRowIndex, setDraggedRowIndex] = useState(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState(null);
  const [modalTask, setModalTask] = useState(null);
  const [modalTaskData, setModalTaskData] = useState(null);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  
  // Custom View Options
  const [showCols, setShowCols] = useState({
    duration: true, start: true, end: true, progress: true, 
    dependencies: true, resources: false, planned: false, 
    baselineStart: false, baselineEnd: false, resourceGroup: false
  });
  const [showGanttLabels, setShowGanttLabels] = useState(true);
  const [scheduleSettings, setScheduleSettings] = useState(() => {
    const saved = localStorage.getItem('gantt_schedule_settings');
    return saved ? JSON.parse(saved) : { durationUnit: 'days', hoursPerDay: 8 };
  });
  
  const updateScheduleSettings = (newSettings) => {
    setScheduleSettings(newSettings);
    localStorage.setItem('gantt_schedule_settings', JSON.stringify(newSettings));
  };
  
  const formatDuration = (days) => {
    if (scheduleSettings.durationUnit === 'hours') return `${days * scheduleSettings.hoursPerDay}h`;
    if (scheduleSettings.durationUnit === 'minutes') return `${days * scheduleSettings.hoursPerDay * 60}m`;
    return `${days}d`;
  };

  const parseDurationToDays = (val) => {
    const num = parseFloat(val) || 1;
    if (scheduleSettings.durationUnit === 'hours') return Math.max(1, Math.ceil(num / scheduleSettings.hoursPerDay));
    if (scheduleSettings.durationUnit === 'minutes') return Math.max(1, Math.ceil(num / (scheduleSettings.hoursPerDay * 60)));
    return Math.max(1, Math.round(num));
  };

  const timelineRef = useRef(null);
  const splitDragRef = useRef(null);
  const inputRef = useRef(null);
  const newTaskRef = useRef(null);

  /* Precisa espelhar --gantt-row-h de tokens.css. As setas de
     dependência são posicionadas em JS e sairiam da linha se divergisse. */
  const rowH = state.density === 'compact' ? 30 : 40;

  const zoom = ZOOM_LEVELS[zoomIdx];
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const projectTasks = useMemo(() => {
    const rawTasks = state.tasks
      .filter((t) => t.projectId === state.activeProjectId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || new Date(a.startDate) - new Date(b.startDate));
      
    // Clone para podermos calcular resumos sem mutar o state original
    const tasks = rawTasks.map(t => ({ ...t }));
    
    // Processamento de baixo para cima para tarefas resumo
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      const currentIndent = t.indentLevel || 0;
      
      const children = [];
      for (let j = i + 1; j < tasks.length; j++) {
        const childIndent = tasks[j].indentLevel || 0;
        if (childIndent <= currentIndent) break;
        if (childIndent === currentIndent + 1) {
          children.push(tasks[j]);
        }
      }
      
      if (children.length > 0) {
        t.isSummary = true;
        const startDates = children.map(c => c.startDate).filter(Boolean).sort();
        const endDates = children.map(c => c.endDate).filter(Boolean).sort();
        t.startDate = startDates.length > 0 ? startDates[0] : t.startDate;
        t.endDate = endDates.length > 0 ? endDates[endDates.length - 1] : t.endDate;
        
        let totalDur = 0;
        let earned = 0;
        children.forEach(c => {
          const d = durationDays(c.startDate, c.endDate) || 1;
          totalDur += d;
          earned += d * (c.progress || 0);
        });
        t.progress = totalDur > 0 ? Math.round(earned / totalDur) : 0;
      } else {
        t.isSummary = false;
      }
    }
    
    return tasks;
  }, [state.tasks, state.activeProjectId]);

  /* ── auto-scheduling ───────────────────────────────────────── */
  const applyAutoScheduling = useCallback((changedTask, allTasks) => {
    const updates = new Map();
    updates.set(changedTask.id, changedTask);

    const succMap = {};
    allTasks.forEach(t => {
      if (t.dependsOn) {
        String(t.dependsOn).split(',').forEach(depStr => {
          const depId = depStr.trim();
          if (!succMap[depId]) succMap[depId] = [];
          succMap[depId].push(t.id);
        });
      }
    });

    const queue = [changedTask];
    const visited = new Set(); 

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      if (!current.endDate) continue;

      const succs = succMap[current.id] || [];
      for (const sId of succs) {
        const sTaskBase = allTasks.find(t => t.id === sId);
        if (!sTaskBase) continue;
        
        const sTask = updates.get(sId) || { ...sTaskBase };
        
        const currentEndMs = new Date(current.endDate + 'T12:00:00').getTime();
        const targetStartMs = currentEndMs + 86400000; 
        
        if (sTask.startDate) {
          const sStartMs = new Date(sTask.startDate + 'T12:00:00').getTime();
          if (sStartMs < targetStartMs) {
            const sDur = durationDays(sTask.startDate, sTask.endDate);
            const newStartDateStr = new Date(targetStartMs).toISOString().slice(0, 10);
            const newEndDateStr = addDays(newStartDateStr, sDur - 1);
            
            sTask.startDate = newStartDateStr;
            sTask.endDate = newEndDateStr;
            
            updates.set(sTask.id, sTask);
            queue.push(sTask);
          }
        }
      }
    }
    
    return Array.from(updates.values());
  }, []);

  /* ── critical path calculation ───────────────────────────── */
  const criticalTasks = useMemo(() => {
    if (!projectTasks.length || !showCriticalPath) return new Set();
    const succMap = {};
    projectTasks.forEach(t => {
      if (t.dependsOn) {
        String(t.dependsOn).split(',').forEach(depStr => {
          const depId = depStr.trim();
          if (!succMap[depId]) succMap[depId] = [];
          succMap[depId].push(t.id);
        });
      }
    });

    const endDates = projectTasks.map(t => new Date(t.endDate + 'T12:00:00').getTime());
    const validEnds = endDates.filter(t => !isNaN(t));
    const projectEnd = validEnds.length > 0 ? Math.max(...validEnds) : Date.now();

    const lateFinish = {};
    const visiting = new Set();
    const getLF = (taskId) => {
      if (lateFinish[taskId] !== undefined) return lateFinish[taskId];
      if (visiting.has(taskId)) return projectEnd; // Evita loop infinito em deps circulares
      
      visiting.add(taskId);
      const succs = succMap[taskId] || [];
      if (succs.length === 0) {
        lateFinish[taskId] = projectEnd;
      } else {
        let minLS = Infinity;
        for (const sId of succs) {
          const sTask = projectTasks.find(t => t.id === sId);
          if (sTask) {
            const sLF = getLF(sId);
            const durationMs = (durationDays(sTask.startDate, sTask.endDate) - 1) * 86400000;
            const sLS = sLF - durationMs;
            if (sLS < minLS) minLS = sLS;
          }
        }
        lateFinish[taskId] = minLS === Infinity ? projectEnd : minLS;
      }
      visiting.delete(taskId);
      return lateFinish[taskId];
    };

    const criticalSet = new Set();
    projectTasks.forEach(t => {
      const lf = getLF(t.id);
      const ef = new Date(t.endDate + 'T12:00:00').getTime();
      if (Math.abs(lf - ef) < 86400000) {
        criticalSet.add(t.id);
      }
    });
    return criticalSet;
  }, [projectTasks, showCriticalPath]);

  /* ── timeline range ──────────────────────────────────────── */
  const { timelineStart, timelineDays, headerDates, monthGroups } = useMemo(() => {
    const todayStr = today();
    let minDate = todayStr;
    let maxDate = addDays(todayStr, 30);

    if (projectTasks.length > 0) {
      const starts = projectTasks.map((t) => t.startDate).filter(Boolean);
      const ends = projectTasks.map((t) => t.endDate).filter(Boolean);
      if (starts.length > 0) minDate = starts.sort()[0];
      if (ends.length > 0) {
        const lastEnd = ends.sort().reverse()[0];
        if (lastEnd > maxDate) maxDate = lastEnd;
      }
    }

    const padStart = addDays(minDate, -5);
    const padEnd = addDays(maxDate, 15);
    let totalDays = daysBetween(padStart, padEnd);
    if (totalDays < 365) totalDays = 365;

    const dates = [];
    const months = {};
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(padStart, i);
      dates.push(d);
      const monthKey = d.slice(0, 7); // YYYY-MM
      if (!months[monthKey]) months[monthKey] = { label: getMonthLabel(d), startIdx: i, count: 0 };
      months[monthKey].count++;
    }

    return {
      timelineStart: padStart,
      timelineDays: totalDays,
      headerDates: dates,
      monthGroups: Object.values(months),
    };
  }, [projectTasks]);

  /* ── scroll to today on mount ────────────────────────────── */
  useEffect(() => {
    if (timelineRef.current) {
      const todayOffset = daysBetween(timelineStart, today());
      if (todayOffset > 0) {
        const scrollTo = Math.max(0, todayOffset * zoom.dayWidth - 200);
        timelineRef.current.scrollLeft = scrollTo;
      }
    }
  }, [timelineStart, zoom.dayWidth]);

  /* ── inline editing ──────────────────────────────────────── */
  const getPredecessorDisplay = (dependsOnStr) => {
    if (!dependsOnStr) return '';
    const ids = String(dependsOnStr).split(',').map(s => s.trim());
    const rowNums = ids.map(id => {
      const idx = projectTasks.findIndex(t => t.id === id);
      return idx >= 0 ? idx + 1 : null;
    }).filter(Boolean);
    return rowNums.join(', ');
  };

  const handlePredecessorEdit = (inputValue) => {
    if (!inputValue || !String(inputValue).trim()) return '';
    const rowNums = String(inputValue).split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const ids = rowNums.map(num => {
      const task = projectTasks[num - 1];
      return task ? task.id : null;
    }).filter(Boolean);
    return ids.join(',');
  };

  const startEdit = (taskId, field, currentValue) => {
    setEditingCell({ taskId, field });
    if (field === 'dependsOn') {
      setEditValue(getPredecessorDisplay(currentValue));
    } else {
      setEditValue(currentValue ?? '');
    }
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const task = projectTasks.find((t) => t.id === editingCell.taskId);
    if (!task) { setEditingCell(null); return; }

    let value = editValue;
    if (editingCell.field === 'dependsOn') {
      value = handlePredecessorEdit(editValue);
    } else if (editingCell.field === 'progress') {
      value = Math.max(0, Math.min(100, parseInt(value) || 0));
    }
    if (editingCell.field === 'duration') {
      const days = parseDurationToDays(value);
      if (task.startDate) {
        const newEnd = addDays(task.startDate, days - 1);
        const modifiedTask = { ...task, endDate: newEnd };
        const updates = applyAutoScheduling(modifiedTask, projectTasks);
        await updateTasksBatch(updates);
        setEditingCell(null);
        return;
      }
    }

    const modifiedTask = { ...task, [editingCell.field]: value };
    let updates = [modifiedTask];
    if (['startDate', 'endDate', 'duration', 'dependsOn'].includes(editingCell.field)) {
      updates = applyAutoScheduling(modifiedTask, projectTasks);
    }
    await updateTasksBatch(updates);
    setEditingCell(null);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditingCell(null);
    if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
    }
  };

  /* ── add task inline ─────────────────────────────────────── */
  const handleAddInline = async (e) => {
    if (e.key !== 'Enter' || !newTaskName.trim()) return;
    const todayStr = today();
    const task = {
      id: generateId(),
      projectId: state.activeProjectId,
      name: newTaskName.trim(),
      startDate: todayStr,
      endDate: addDays(todayStr, 4),
      status: 'Não Iniciada',
      progress: 0,
      assignee: '',
      dependsOn: '',
      order: projectTasks.length,
    };
    await addTask(task);
    setNewTaskName('');
    showToast('Tarefa adicionada', 'success');
    // Keep focus on the input for rapid entry
    setTimeout(() => newTaskRef.current?.focus(), 50);
  };

  /* ── drag bar ────────────────────────────────────────────── */
  const handleBarMouseDown = useCallback((e, task) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = task.startDate;
    const origEnd = task.endDate;
    let currentDelta = 0;

    const handleMove = (ev) => {
      const dx = ev.clientX - startX;
      currentDelta = Math.round(dx / zoom.dayWidth);
      setDraggingTask(task.id);
      setDragDelta(currentDelta);
    };

    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (currentDelta !== 0) {
        const newStart = addDays(origStart, currentDelta);
        const newEnd = addDays(origEnd, currentDelta);
        const modifiedTask = { ...task, startDate: newStart, endDate: newEnd };
        const updates = applyAutoScheduling(modifiedTask, projectTasks);
        await updateTasksBatch(updates);
      }
      setDraggingTask(null);
      setDragDelta(0);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [zoom.dayWidth, updateTask]);

  /* ── row drag and drop (reorder) ─────────────────────────── */
  const handleRowDragStart = (e, index) => {
    setDraggedRowIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRowIndex !== index) {
      setDragOverRowIndex(index);
    }
  };

  const handleRowDrop = async (e, targetIndex) => {
    e.preventDefault();
    setDragOverRowIndex(null);
    if (draggedRowIndex === null || draggedRowIndex === targetIndex) {
      setDraggedRowIndex(null);
      return;
    }
    const newTasks = [...projectTasks];
    const draggedTask = newTasks[draggedRowIndex];
    newTasks.splice(draggedRowIndex, 1);
    newTasks.splice(targetIndex, 0, draggedTask);

    const updates = [];
    newTasks.forEach((task, idx) => {
      if (task.order !== idx) {
        updates.push({ ...task, order: idx });
      }
    });
    for (const t of updates) {
      await updateTask(t);
    }
    setDraggedRowIndex(null);
  };

  const handleRowDragEnd = () => {
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  /* ── resize bar (right edge) ─────────────────────────────── */
  const handleResizeMouseDown = useCallback((e, task) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const origEnd = task.endDate;
    let currentDelta = 0;

    const handleMove = (ev) => {
      const dx = ev.clientX - startX;
      currentDelta = Math.round(dx / zoom.dayWidth);
      setDraggingTask(task.id + '-resize');
      setDragDelta(currentDelta);
    };

    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (currentDelta !== 0) {
        const newEnd = addDays(origEnd, currentDelta);
        if (newEnd >= task.startDate) {
          const modifiedTask = { ...task, endDate: newEnd };
          const updates = applyAutoScheduling(modifiedTask, projectTasks);
          await updateTasksBatch(updates);
        }
      }
      setDraggingTask(null);
      setDragDelta(0);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [zoom.dayWidth, updateTask]);

  /* ── modal handling ──────────────────────────────────────── */
  const openTaskModal = (task) => {
    setModalTask(task);
    setModalTaskData({ ...task });
  };

  const handleSaveModal = async () => {
    if (modalTaskData) {
      if (modalTaskData.progress !== undefined) {
        modalTaskData.progress = Math.max(0, Math.min(100, parseInt(modalTaskData.progress) || 0));
      }
      const updates = applyAutoScheduling(modalTaskData, projectTasks);
      await updateTasksBatch(updates);
    }
    setModalTask(null);
  };

  const handleSaveBaseline = () => {
    setConfirmAction({
      title: 'Salvar Linha de Base',
      message: 'Deseja salvar a linha de base atual para todas as tarefas deste projeto? Isso sobrescreverá qualquer linha de base anterior.',
      onConfirm: async () => {
        for (const t of projectTasks) {
          if (t.startDate && t.endDate) {
            await updateTask({
              ...t,
              baselineStart: t.startDate,
              baselineEnd: t.endDate
            });
          }
        }
        showToast('Linha de base salva com sucesso!', 'success');
      }
    });
  };

  const exportToExcel = () => {
    const wsData = [
      ["ID", "Nome da Tarefa", "Duração (dias)", "Início", "Término", "% Concluída", "% Planejada", "Início Baseline", "Término Baseline", "Recursos", "Grupo de Recurso", "Predecessoras"]
    ];
    
    projectTasks.forEach((t, i) => {
      const planned = calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd);
      wsData.push([
        i + 1,
        t.name,
        durationDays(t.startDate, t.endDate) || 0,
        t.startDate || '',
        t.endDate || '',
        t.progress || 0,
        planned,
        t.baselineStart || '',
        t.baselineEnd || '',
        t.resources || '',
        t.resourceGroup || '',
        t.dependsOn || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gantt");
    XLSX.writeFile(wb, `${activeProject.name || 'Projeto'}_Gantt.xlsx`);
  };

  const handleIndent = async (taskId, delta) => {
    const task = projectTasks.find(t => t.id === taskId);
    if (!task) return;
    const newIndent = Math.max(0, (task.indentLevel || 0) + delta);
    await updateTask({ ...task, indentLevel: newIndent });
  };

  /* ── split pane drag ─────────────────────────────────────── */
  const handleSplitDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = splitWidth;

    const handleMove = (ev) => {
      const dx = ev.clientX - startX;
      setSplitWidth(Math.max(320, Math.min(800, startW + dx)));
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [splitWidth]);

  /* ── render cell ─────────────────────────────────────────── */
  const renderCell = (task, field, displayValue, width, align = 'left', type = 'text') => {
    const isEditing = editingCell?.taskId === task.id && editingCell?.field === field;
    if (isEditing) {
      if (type === 'select') {
        return (
          <div className="gantt-cell" style={{ width, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
            <select
              ref={inputRef}
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); }}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              className="gantt-cell-input"
              autoFocus
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      }
      return (
        <div className="gantt-cell" style={{ width, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
          <input
            ref={inputRef}
            type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            className="gantt-cell-input"
            autoFocus
          />
        </div>
      );
    }
    return (
      <div
        className="gantt-cell"
        style={{ width, justifyContent: align === 'center' ? 'center' : 'flex-start' }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // Block editing of calculated fields for summary tasks
          if (task.isSummary && ['startDate', 'endDate', 'progress', 'duration'].includes(field)) {
            showToast('Campos calculados automaticamente para tarefas resumo.', 'info');
            return;
          }
          startEdit(task.id, field, task[field]);
        }}
        title="Duplo-clique para editar"
      >
        <span className={`gantt-cell-text ${field === 'name' ? 'cell-name' : ''}`} style={{ fontWeight: task.isSummary ? 600 : 400 }}>
          {field === 'name' && (
            <span style={{ 
              display: 'inline-block', 
              width: `${(task.indentLevel || 0) * 16}px` 
            }} />
          )}
          {displayValue}
        </span>
      </div>
    );
  };

  /* PageGantt is always rendered inside ProjectWorkspace — no guard needed */
  if (!activeProject) return null;

  const totalWidth = timelineDays * zoom.dayWidth;
  const todayIdx = daysBetween(timelineStart, today());

  return (
    <div className="gantt-page flex h-full flex-col" id="pageGantt">
      {/* ── Barra da view ──────────────────────────────────── */}
      <ViewBar>
        <ViewBarSegments
          options={ZOOM_LEVELS.map((z) => ({ id: z.id, label: z.label }))}
          value={zoom.id}
          onChange={(id) => setZoomIdx(ZOOM_LEVELS.findIndex((z) => z.id === id))}
        />
        <ViewBarDivider />
        <ViewBarButton
          icon={AlertCircle}
          active={showCriticalPath}
          onClick={() => setShowCriticalPath(!showCriticalPath)}
          title="Destacar o caminho crítico"
        >
          Caminho crítico
        </ViewBarButton>
        <ViewBarButton
          icon={Target}
          onClick={handleSaveBaseline}
          title="Salvar um retrato das datas atuais"
        >
          Baseline
        </ViewBarButton>

        <div className="ml-auto" />

        <ViewBarButton icon={Download} onClick={exportToExcel} title="Exportar para Excel">
          Excel
        </ViewBarButton>

        {/* Configurações de cronograma */}
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
                onCheckedChange={() =>
                  updateScheduleSettings({ ...scheduleSettings, durationUnit: u.id })
                }
              >
                {u.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-body">
              <span className="text-text-2">Horas por dia</span>
              <input
                type="number"
                min="1"
                max="24"
                value={scheduleSettings.hoursPerDay}
                onChange={(e) =>
                  updateScheduleSettings({
                    ...scheduleSettings,
                    hoursPerDay: parseInt(e.target.value, 10) || 8,
                  })
                }
                className="h-7 w-16 rounded-[6px] border border-line bg-surface-0 px-2 text-body tabular-nums text-text-1"
              />
            </label>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Colunas visíveis */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ViewBarButton icon={Settings}>Colunas</ViewBarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
              Colunas da planilha
            </DropdownMenuLabel>
            {Object.keys(showCols).map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={showCols[key]}
                onCheckedChange={(v) => setShowCols({ ...showCols, [key]: v })}
                onSelect={(e) => e.preventDefault()}
              >
                {COLUMN_LABELS[key] || key}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showGanttLabels}
              onCheckedChange={setShowGanttLabels}
              onSelect={(e) => e.preventDefault()}
            >
              Rótulos nas barras
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ViewBarButton
          icon={Plus}
          variant="primary"
          onClick={() => newTaskRef.current?.focus()}
        >
          Tarefa
        </ViewBarButton>
      </ViewBar>

      {/* ── Main Gantt Area ────────────────────────────────── */}
      <div className="gantt-main">
        {/* ── Left: Spreadsheet ────────────────────────────── */}
        <div className="gantt-spreadsheet" style={{ width: splitWidth }}>
          {/* Column headers */}
          <div className="gantt-sheet-header">
            <div className="gantt-cell cell-id" style={{ width: 36 }}>#</div>
            <div className="gantt-cell cell-name-header" style={{ flex: 1 }}>Nome da Tarefa</div>
            {showCols.duration && <div className="gantt-cell" style={{ width: 60, justifyContent: 'center' }}>Duração</div>}
            {showCols.start && <div className="gantt-cell" style={{ width: 85, justifyContent: 'center' }}>Início</div>}
            {showCols.end && <div className="gantt-cell" style={{ width: 85, justifyContent: 'center' }}>Término</div>}
            {showCols.progress && <div className="gantt-cell" style={{ width: 45, justifyContent: 'center' }}>%</div>}
            {showCols.planned && <div className="gantt-cell" style={{ width: 50, justifyContent: 'center' }} title="% Planejada">% Plan.</div>}
            {showCols.baselineStart && <div className="gantt-cell" style={{ width: 85, justifyContent: 'center' }}>Início Base</div>}
            {showCols.baselineEnd && <div className="gantt-cell" style={{ width: 85, justifyContent: 'center' }}>Fim Base</div>}
            {showCols.dependencies && <div className="gantt-cell" style={{ width: 60, justifyContent: 'center' }}>Pred.</div>}
            {showCols.resources && <div className="gantt-cell" style={{ width: 80, justifyContent: 'center' }}>Recursos</div>}
            {showCols.resourceGroup && <div className="gantt-cell" style={{ width: 80, justifyContent: 'center' }}>Grupo</div>}
          </div>

          {/* Task rows */}
          <div className="gantt-sheet-body">
            {projectTasks.map((task, idx) => (
              <div 
                key={task.id} 
                className={`gantt-sheet-row ${editingCell?.taskId === task.id ? 'editing' : ''} ${dragOverRowIndex === idx ? 'drag-over' : ''} ${draggedRowIndex === idx ? 'dragging-row' : ''}`}
                draggable={editingCell?.taskId !== task.id}
                onDragStart={(e) => handleRowDragStart(e, idx)}
                onDragOver={(e) => handleRowDragOver(e, idx)}
                onDrop={(e) => handleRowDrop(e, idx)}
                onDragEnd={handleRowDragEnd}
                onDoubleClick={() => openTaskModal(task)}
                title="Duplo-clique na linha para abrir as configurações da tarefa"
              >
                <div className="gantt-cell cell-id" style={{ width: 36, cursor: 'grab' }} title="Arraste para reordenar">
                  <GripVertical size={10} className="grip-icon" style={{ opacity: 0.4, marginRight: 2 }} />
                  <span className="row-number">{idx + 1}</span>
                </div>
                {renderCell(task, 'name', task.name, undefined, 'left', 'text')}
                {showCols.duration && renderCell(task, 'duration', formatDuration(durationDays(task.startDate, task.endDate)), 60, 'center', 'number')}
                {showCols.start && renderCell(task, 'startDate', formatDateShort(task.startDate), 85, 'center', 'date')}
                {showCols.end && renderCell(task, 'endDate', formatDateShort(task.endDate), 85, 'center', 'date')}
                {showCols.progress && renderCell(task, 'progress', `${task.progress || 0}`, 45, 'center', 'number')}
                {showCols.planned && renderCell(task, 'plannedProgress', `${calculateTaskPlannedProgress(task.baselineStart, task.baselineEnd)}`, 50, 'center', 'text')}
                {showCols.baselineStart && renderCell(task, 'baselineStart', formatDateShort(task.baselineStart), 85, 'center', 'date')}
                {showCols.baselineEnd && renderCell(task, 'baselineEnd', formatDateShort(task.baselineEnd), 85, 'center', 'date')}
                {showCols.dependencies && renderCell(task, 'dependsOn', getPredecessorDisplay(task.dependsOn), 60, 'center', 'text')}
                {showCols.resources && renderCell(task, 'resources', task.resources || '', 80, 'left', 'text')}
                {showCols.resourceGroup && renderCell(task, 'resourceGroup', task.resourceGroup || '', 80, 'left', 'text')}
              </div>
            ))}

            {/* New task row — always visible */}
            <div className="gantt-sheet-row new-task-row">
              <div className="gantt-cell cell-id" style={{ width: 36 }}>
                <Plus size={12} className="add-icon" />
              </div>
              <div className="gantt-cell" style={{ flex: 1 }}>
                <input
                  ref={newTaskRef}
                  type="text"
                  className="new-task-input"
                  placeholder="Nova tarefa... (Enter para adicionar)"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={handleAddInline}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Splitter ─────────────────────────────────────── */}
        <div className="gantt-splitter" onMouseDown={handleSplitDrag}>
          <div className="splitter-grip" />
        </div>

        {/* ── Right: Timeline ──────────────────────────────── */}
        <div className="gantt-timeline" ref={timelineRef}>
          <div className="gantt-timeline-inner" style={{ width: totalWidth }}>
            {/* Month header */}
            <div className="gantt-month-header">
              {monthGroups.map((mg, i) => (
                <div key={i} className="gantt-month-cell" style={{ width: mg.count * zoom.dayWidth }}>
                  {mg.count * zoom.dayWidth > 60 && <span>{mg.label}</span>}
                </div>
              ))}
            </div>

            {/* Day header */}
            <div className="gantt-day-header">
              {headerDates.map((d) => {
                const date = new Date(d + 'T12:00:00');
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isToday = d === today();
                return (
                  <div
                    key={d}
                    className={`gantt-day-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
                    style={{ width: zoom.dayWidth }}
                  >
                    {zoom.id === 'day' && (
                      <>
                        <span className="day-num">{date.getDate()}</span>
                        <span className="day-char">{getDayOfWeekChar(d)}</span>
                      </>
                    )}
                    {zoom.id === 'week' && date.getDay() === 1 && (
                      <span className="day-num">{date.getDate()}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bars area */}
            <div className="gantt-bars-area">
              {/* Grid columns */}
              <div className="gantt-grid-bg">
                {headerDates.map((d) => {
                  const date = new Date(d + 'T12:00:00');
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isToday = d === today();
                  return (
                    <div
                      key={d}
                      className={`gantt-grid-col ${isWeekend ? 'weekend' : ''} ${isToday ? 'today-col' : ''}`}
                      style={{ width: zoom.dayWidth }}
                    />
                  );
                })}
              </div>

              {/* Today line */}
              {todayIdx >= 0 && todayIdx < timelineDays && (
                <div
                  className="gantt-today-line"
                  style={{ left: todayIdx * zoom.dayWidth + zoom.dayWidth / 2 }}
                />
              )}

              {/* Task bar rows */}
              {projectTasks.map((task) => {
                if (!task.startDate || !task.endDate) {
                  return <div key={task.id} className="gantt-bar-row" />;
                }

                const isDragging = draggingTask === task.id;
                const isResizing = draggingTask === task.id + '-resize';
                const offset = daysBetween(
                  timelineStart,
                  isDragging ? addDays(task.startDate, dragDelta) : task.startDate
                );
                const duration = durationDays(
                  isDragging ? addDays(task.startDate, dragDelta) : task.startDate,
                  isResizing ? addDays(task.endDate, dragDelta) : (isDragging ? addDays(task.endDate, dragDelta) : task.endDate)
                );
                const left = offset * zoom.dayWidth;
                const width = Math.max(duration * zoom.dayWidth, zoom.dayWidth);
                const barColor = STATUS_COLORS[task.status] || STATUS_COLORS['Não Iniciada'];

                return (
                  <div key={task.id} className="gantt-bar-row">
                    {/* Baseline */}
                    {task.baselineStart && task.baselineEnd && (
                      <div
                        className="gantt-baseline-bar"
                        style={{
                          left: daysBetween(timelineStart, task.baselineStart) * zoom.dayWidth,
                          width: Math.max(durationDays(task.baselineStart, task.baselineEnd) * zoom.dayWidth, zoom.dayWidth)
                        }}
                        title={`Linha de Base\nInício: ${formatDateShort(task.baselineStart)}\nTérmino: ${formatDateShort(task.baselineEnd)}`}
                      />
                    )}

                    {/* Bar or Milestone */}
                    {task.startDate === task.endDate ? (
                      <div
                        className={`gantt-milestone ${isDragging ? 'dragging' : ''} ${showCriticalPath && !criticalTasks.has(task.id) ? 'dimmed' : ''}`}
                        style={{ left: left + zoom.dayWidth / 2 - 9, '--bar-color': showCriticalPath && criticalTasks.has(task.id) ? COLOR_CRITICAL : barColor }}
                        onMouseDown={(e) => handleBarMouseDown(e, task)}
                        title={`Marco: ${task.name}\nData: ${formatDateShort(task.startDate)}`}
                      >
                        <div className="gantt-milestone-diamond" style={{ background: showCriticalPath && criticalTasks.has(task.id) ? COLOR_CRITICAL : undefined }} />
                        {showGanttLabels && <span className="gantt-milestone-label">{task.name}</span>}
                      </div>
                    ) : (
                      <div
                        className={`gantt-bar ${isDragging ? 'dragging' : ''} ${task.isBlocked ? 'is-blocked' : ''} ${showCriticalPath && criticalTasks.has(task.id) ? 'is-critical' : ''} ${showCriticalPath && !criticalTasks.has(task.id) ? 'dimmed' : ''}`}
                        style={{ left, width, '--bar-color': showCriticalPath && criticalTasks.has(task.id) ? COLOR_CRITICAL : barColor }}
                        onMouseDown={(e) => handleBarMouseDown(e, task)}
                        title={`${task.name}\n${formatDateShort(task.startDate)} → ${formatDateShort(task.endDate)}\nProgresso: ${task.progress || 0}%\n${task.isBlocked ? '⚠️ BLOQUEADO: ' + (task.blockReason || '') : ''}`}
                      >
                        {/* Progress fill */}
                        <div className="gantt-bar-progress" style={{ width: `${task.progress || 0}%` }} />

                        {/* Label */}
                        {showGanttLabels && width > 50 && <span className="gantt-bar-label">{task.name}</span>}

                        {/* Resize handle */}
                        <div
                          className="gantt-bar-resize"
                          onMouseDown={(e) => handleResizeMouseDown(e, task)}
                        />
                      </div>
                    )}

                    {/* Dependency lines are now drawn in a global layer below */}
                  </div>
                );
              })}

              {/* Empty row for new task alignment */}
              <div className="gantt-bar-row new-task-placeholder" />

              {/* DEPENDENCY LINES (Global Layer) */}
              <svg className="gantt-dep-svg" style={{ width: totalWidth, height: projectTasks.length * rowH }}>
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                    <polygon points="0 0, 6 3, 0 6" fill={COLOR_DEP_LINE} />
                  </marker>
                </defs>
                {projectTasks.map((task) => {
                  if (!task.dependsOn || !task.startDate || !task.endDate) return null;
                  
                  const isDragging = draggingTask === task.id;
                  const isMilestone = task.startDate === task.endDate;
                  const offset = daysBetween(
                    timelineStart,
                    isDragging ? addDays(task.startDate, dragDelta) : task.startDate
                  );
                  // O bico esquerdo do losango fica em (meio do dia - 13px)
                  const left = offset * zoom.dayWidth + (isMilestone ? zoom.dayWidth / 2 - 17 : -4);

                  return String(task.dependsOn).split(',').map((depId) => {
                    if (depId.trim() === task.id) return null;
                    
                    const depTask = projectTasks.find((t) => t.id === depId.trim());
                    if (!depTask || !depTask.endDate) return null;
                    
                    const depIsDragging = draggingTask === depTask.id;
                    const depIsResizing = draggingTask === depTask.id + '-resize';
                    const depEndDate = depIsResizing ? addDays(depTask.endDate, dragDelta) : (depIsDragging ? addDays(depTask.endDate, dragDelta) : depTask.endDate);
                    
                    const depIsMilestone = depTask.startDate === depTask.endDate;
                    const depOffset = daysBetween(timelineStart, depEndDate);
                    // O bico direito do losango fica em (meio do dia + 13px)
                    const depEndPx = depOffset * zoom.dayWidth + (depIsMilestone ? zoom.dayWidth / 2 + 13 : zoom.dayWidth);

                    const depRow = projectTasks.indexOf(depTask);
                    const curRow = projectTasks.indexOf(task);
                    const depY = depRow * rowH + rowH / 2;
                    const curY = curRow * rowH + rowH / 2;
                    
                    const pad = 12;
                    const r = 6;
                    let pathD = '';
                    
                    if (left - depEndPx > pad * 2) {
                      const midX = depEndPx + pad;
                      if (depY === curY) {
                        pathD = `M ${depEndPx} ${depY} L ${left} ${curY}`;
                      } else {
                        const dirY = curY > depY ? 1 : -1;
                        pathD = `M ${depEndPx} ${depY} L ${midX - r} ${depY} Q ${midX} ${depY} ${midX} ${depY + r * dirY} L ${midX} ${curY - r * dirY} Q ${midX} ${curY} ${midX + r} ${curY} L ${left} ${curY}`;
                      }
                    } else {
                      const midY = depY + (curY >= depY ? rowH / 2 : -rowH / 2);
                      const dirY1 = midY > depY ? 1 : -1;
                      const dirY2 = curY > midY ? 1 : -1;
                      
                      pathD = `M ${depEndPx} ${depY} L ${depEndPx + pad - r} ${depY} Q ${depEndPx + pad} ${depY} ${depEndPx + pad} ${depY + r * dirY1} L ${depEndPx + pad} ${midY - r * dirY1} Q ${depEndPx + pad} ${midY} ${depEndPx + pad - r} ${midY} L ${left - pad + r} ${midY} Q ${left - pad} ${midY} ${left - pad} ${midY + r * dirY2} L ${left - pad} ${curY - r * dirY2} Q ${left - pad} ${curY} ${left - pad + r} ${curY} L ${left} ${curY}`;
                    }

                    const isCriticalDep = showCriticalPath && criticalTasks.has(task.id) && criticalTasks.has(depTask.id);

                    return (
                      <path
                        key={`${task.id}-${depId}`}
                        d={pathD}
                        fill="none"
                        stroke={isCriticalDep ? COLOR_CRITICAL : COLOR_DEP_LINE}
                        strokeWidth={isCriticalDep ? 2.5 : 1.5}
                        markerEnd="url(#arrow)"
                      />
                    );
                  });
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Task Details Modal ─────────────────────────────── */}
      <Modal
        isOpen={!!modalTask}
        onClose={() => setModalTask(null)}
        title="Detalhes da Tarefa"
      >
        {modalTaskData && (
          <div className="modal-body">
            <div className="form-group">
              <label>Nome da Tarefa</label>
              <input
                type="text"
                value={modalTaskData.name}
                onChange={(e) => setModalTaskData({ ...modalTaskData, name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Início</label>
                <input
                  type="date"
                  value={modalTaskData.startDate}
                  onChange={(e) => setModalTaskData({ ...modalTaskData, startDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Término</label>
                <input
                  type="date"
                  value={modalTaskData.endDate}
                  onChange={(e) => setModalTaskData({ ...modalTaskData, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Progresso (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={modalTaskData.progress}
                  onChange={(e) => setModalTaskData({ ...modalTaskData, progress: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={modalTaskData.status}
                  onChange={(e) => setModalTaskData({ ...modalTaskData, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Predecessoras (IDs separados por vírgula)</label>
              <input
                type="text"
                placeholder="Ex: 1, 3"
                value={getPredecessorDisplay(modalTaskData.dependsOn)}
                onChange={(e) => setModalTaskData({ ...modalTaskData, dependsOn: handlePredecessorEdit(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>Recursos / Mão de Obra</label>
              <input
                type="text"
                placeholder="Ex: 2 Mecânicos, 1 Guindaste"
                value={modalTaskData.resources || ''}
                onChange={(e) => setModalTaskData({ ...modalTaskData, resources: e.target.value })}
              />
            </div>
            
            <div className="form-group">
              <label>Grupo de Recurso</label>
              <input
                type="text"
                placeholder="Ex: Terceirizados, Engenharia"
                value={modalTaskData.resourceGroup || ''}
                onChange={(e) => setModalTaskData({ ...modalTaskData, resourceGroup: e.target.value })}
              />
            </div>
            
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Hierarquia (Nível atual: {modalTaskData.indentLevel || 0})</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setModalTaskData({ ...modalTaskData, indentLevel: Math.max(0, (modalTaskData.indentLevel || 0) - 1) })}>
                  <Outdent size={14} /> Recuar
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setModalTaskData({ ...modalTaskData, indentLevel: (modalTaskData.indentLevel || 0) + 1 })}>
                  <Indent size={14} /> Avançar
                </button>
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button 
                className="btn-icon-only btn-danger-ghost" 
                title="Excluir Tarefa"
                onClick={() => {
                  setConfirmAction({
                    title: 'Excluir Tarefa',
                    message: 'Tem certeza que deseja excluir esta tarefa?',
                    onConfirm: async () => {
                      await removeTask(modalTaskData.id);
                      setModalTask(null);
                    }
                  });
                }}
              >
                <Trash2 size={18} />
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-ghost" onClick={() => setModalTask(null)}>Cancelar</button>
                <button className="btn-primary" onClick={handleSaveModal}>Salvar</button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Global Confirm Dialog ─────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction && confirmAction.onConfirm) {
            confirmAction.onConfirm();
          }
        }}
        title={confirmAction?.title}
        message={confirmAction?.message}
      />
    </div>
  );
}
