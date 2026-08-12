import React, { useContext, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import Badge from '../components/Badge';
import ProgressBar from '../components/ProgressBar';
import Modal from '../components/Modal';
import {
  Plus, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, GripVertical,
  ChevronDown, ChevronRight as ChevronRightIcon, Calendar, Milestone,
  Undo2, Redo2, ArrowDownUp, Link2, Eye, Target, AlertCircle,
} from 'lucide-react';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── date helpers ────────────────────────────────────────────── */
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function getMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getDayOfWeekChar(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const names = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  return names[d.getDay()];
}

function durationDays(start, end) {
  if (!start || !end) return 0;
  return daysBetween(start, end) + 1;
}

/* ── zoom configs ────────────────────────────────────────────── */
const ZOOM_LEVELS = [
  { id: 'day', label: 'Dia', dayWidth: 36 },
  { id: 'week', label: 'Semana', dayWidth: 18 },
  { id: 'month', label: 'Mês', dayWidth: 5 },
];

/* ── status config ───────────────────────────────────────────── */
const STATUS_OPTIONS = ['Não Iniciada', 'Em Andamento', 'Concluída', 'Atrasada'];
const STATUS_COLORS = {
  'Não Iniciada': '#94a3b8',
  'Em Andamento': '#3b82f6',
  'Concluída': '#22c55e',
  'Atrasada': '#ef4444',
};

export default function PageGantt() {
  const { state, addTask, updateTask, removeTask, navigate, showToast, selectProject } = useContext(AppContext);
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
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const timelineRef = useRef(null);
  const splitDragRef = useRef(null);
  const inputRef = useRef(null);
  const newTaskRef = useRef(null);

  const zoom = ZOOM_LEVELS[zoomIdx];
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const projectTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => t.projectId === state.activeProjectId)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || new Date(a.startDate) - new Date(b.startDate)),
    [state.tasks, state.activeProjectId]
  );

  /* ── critical path calculation ───────────────────────────── */
  const criticalTasks = useMemo(() => {
    if (!projectTasks.length || !showCriticalPath) return new Set();
    const succMap = {};
    projectTasks.forEach(t => {
      if (t.dependsOn) {
        t.dependsOn.split(',').forEach(depStr => {
          const depId = depStr.trim();
          if (!succMap[depId]) succMap[depId] = [];
          succMap[depId].push(t.id);
        });
      }
    });

    const endDates = projectTasks.map(t => new Date(t.endDate + 'T12:00:00').getTime());
    const projectEnd = Math.max(...endDates.filter(t => !isNaN(t)));

    const lateFinish = {};
    const getLF = (taskId) => {
      if (lateFinish[taskId] !== undefined) return lateFinish[taskId];
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
    const ids = dependsOnStr.split(',').map(s => s.trim());
    const rowNums = ids.map(id => {
      const idx = projectTasks.findIndex(t => t.id === id);
      return idx >= 0 ? idx + 1 : null;
    }).filter(Boolean);
    return rowNums.join(', ');
  };

  const handlePredecessorEdit = (inputValue) => {
    if (!inputValue.trim()) return '';
    const rowNums = inputValue.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
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
      const days = parseInt(value) || 1;
      if (task.startDate) {
        const newEnd = addDays(task.startDate, days - 1);
        await updateTask({ ...task, endDate: newEnd });
        setEditingCell(null);
        return;
      }
    }

    await updateTask({ ...task, [editingCell.field]: value });
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
        await updateTask({
          ...task,
          startDate: addDays(origStart, currentDelta),
          endDate: addDays(origEnd, currentDelta),
        });
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
          await updateTask({ ...task, endDate: newEnd });
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
      await updateTask(modalTaskData);
    }
    setModalTask(null);
  };

  const handleSaveBaseline = async () => {
    if (confirm('Deseja salvar a linha de base atual para todas as tarefas deste projeto? Isso sobrescreverá qualquer linha de base anterior.')) {
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
        onDoubleClick={() => startEdit(task.id, field, task[field])}
        title="Duplo-clique para editar"
      >
        <span className={`gantt-cell-text ${field === 'name' ? 'cell-name' : ''}`}>{displayValue}</span>
      </div>
    );
  };

  /* ── no active project ───────────────────────────────────── */
  if (!activeProject) {
    return (
      <div className="page-section" id="pageGantt">
        <div className="empty-state">
          <Calendar size={48} strokeWidth={1} />
          <h3>Nenhum projeto selecionado</h3>
          <p>Selecione um projeto no Painel de Projetos para visualizar o Gantt.</p>
          <button className="btn-primary" onClick={() => navigate('pageProjects')}>
            Ir para Projetos
          </button>
        </div>
      </div>
    );
  }

  const totalWidth = timelineDays * zoom.dayWidth;
  const todayIdx = daysBetween(timelineStart, today());

  return (
    <div className="page-section gantt-page" id="pageGantt">
      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="gantt-toolbar">
        <div className="toolbar-left">
          <button className="btn-ghost" onClick={() => { selectProject(null); navigate('pageProjects'); }}>
            <ChevronLeft size={16} /> Projetos
          </button>
          <div className="toolbar-divider" />
          <h2 className="gantt-project-title">{activeProject.name}</h2>
        </div>
        <div className="toolbar-right">
          <div className="zoom-controls">
            <button
              className={`zoom-btn ${zoomIdx === 0 ? 'active' : ''}`}
              onClick={() => setZoomIdx(0)}
            >Dia</button>
            <button
              className={`zoom-btn ${zoomIdx === 1 ? 'active' : ''}`}
              onClick={() => setZoomIdx(1)}
            >Semana</button>
            <button
              className={`zoom-btn ${zoomIdx === 2 ? 'active' : ''}`}
              onClick={() => setZoomIdx(2)}
            >Mês</button>
          </div>
          <div className="toolbar-divider" />
          <button
            className={`btn-ghost btn-sm ${showCriticalPath ? 'text-danger' : ''}`}
            onClick={() => setShowCriticalPath(!showCriticalPath)}
            title="Destacar Caminho Crítico"
          >
            <AlertCircle size={14} color={showCriticalPath ? '#ef4444' : 'currentColor'} /> CPM
          </button>
          <button className="btn-ghost btn-sm" onClick={handleSaveBaseline} title="Salvar um retrato das datas atuais">
            <Target size={14} /> Baseline
          </button>
          <button className="btn-primary btn-sm" onClick={() => newTaskRef.current?.focus()}>
            <Plus size={14} /> Tarefa
          </button>
        </div>
      </div>

      {/* ── Main Gantt Area ────────────────────────────────── */}
      <div className="gantt-main">
        {/* ── Left: Spreadsheet ────────────────────────────── */}
        <div className="gantt-spreadsheet" style={{ width: splitWidth }}>
          {/* Column headers */}
          <div className="gantt-sheet-header">
            <div className="gantt-cell cell-id" style={{ width: 36 }}>#</div>
            <div className="gantt-cell cell-name-header" style={{ flex: 1 }}>Nome da Tarefa</div>
            <div className="gantt-cell" style={{ width: 60, justifyContent: 'center' }}>Duração</div>
            <div className="gantt-cell" style={{ width: 85, justifyContent: 'center' }}>Início</div>
            <div className="gantt-cell" style={{ width: 85, justifyContent: 'center' }}>Término</div>
            <div className="gantt-cell" style={{ width: 45, justifyContent: 'center' }}>%</div>
            <div className="gantt-cell" style={{ width: 60, justifyContent: 'center' }}>Pred.</div>
            <div className="gantt-cell" style={{ width: 80, justifyContent: 'center' }}>Recursos</div>
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
              >
                <div className="gantt-cell cell-id" style={{ width: 36, cursor: 'grab' }} title="Arraste para reordenar">
                  <GripVertical size={10} className="grip-icon" style={{ opacity: 0.4, marginRight: 2 }} />
                  <span className="row-number">{idx + 1}</span>
                </div>
                {renderCell(task, 'name', task.name, undefined, 'left', 'text')}
                {renderCell(task, 'duration', `${durationDays(task.startDate, task.endDate)}d`, 60, 'center', 'number')}
                {renderCell(task, 'startDate', formatDateShort(task.startDate), 85, 'center', 'date')}
                {renderCell(task, 'endDate', formatDateShort(task.endDate), 85, 'center', 'date')}
                {renderCell(task, 'progress', `${task.progress || 0}`, 45, 'center', 'number')}
                {renderCell(task, 'dependsOn', getPredecessorDisplay(task.dependsOn), 60, 'center', 'text')}
                {renderCell(task, 'resources', task.resources || '', 80, 'left', 'text')}
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
              <div className="gantt-cell" style={{ width: 60 }} />
              <div className="gantt-cell" style={{ width: 85 }} />
              <div className="gantt-cell" style={{ width: 85 }} />
              <div className="gantt-cell" style={{ width: 45 }} />
              <div className="gantt-cell" style={{ width: 60 }} />
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
                        style={{ left: left + zoom.dayWidth / 2, '--bar-color': showCriticalPath && criticalTasks.has(task.id) ? '#ef4444' : barColor }}
                        onMouseDown={(e) => handleBarMouseDown(e, task)}
                        onDoubleClick={() => openTaskModal(task)}
                        title={`Marco: ${task.name}\nData: ${formatDateShort(task.startDate)}`}
                      >
                        <div className="gantt-milestone-diamond" style={{ background: showCriticalPath && criticalTasks.has(task.id) ? '#ef4444' : undefined }} />
                        <span className="gantt-milestone-label">{task.name}</span>
                      </div>
                    ) : (
                      <div
                        className={`gantt-bar ${isDragging ? 'dragging' : ''} ${task.isBlocked ? 'is-blocked' : ''} ${showCriticalPath && criticalTasks.has(task.id) ? 'is-critical' : ''} ${showCriticalPath && !criticalTasks.has(task.id) ? 'dimmed' : ''}`}
                        style={{ left, width, '--bar-color': showCriticalPath && criticalTasks.has(task.id) ? '#ef4444' : barColor }}
                        onMouseDown={(e) => handleBarMouseDown(e, task)}
                        onDoubleClick={() => openTaskModal(task)}
                        title={`${task.name}\n${formatDateShort(task.startDate)} → ${formatDateShort(task.endDate)}\nProgresso: ${task.progress || 0}%\n${task.isBlocked ? '⚠️ BLOQUEADO: ' + (task.blockReason || '') : ''}`}
                      >
                        {/* Progress fill */}
                        <div className="gantt-bar-progress" style={{ width: `${task.progress || 0}%` }} />

                        {/* Label */}
                        {width > 50 && <span className="gantt-bar-label">{task.name}</span>}

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
              <svg className="gantt-dep-svg" style={{ width: totalWidth, height: projectTasks.length * 40 }}>
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                    <polygon points="0 0, 6 3, 0 6" fill="#8ba1b7" />
                  </marker>
                </defs>
                {projectTasks.map((task) => {
                  if (!task.dependsOn || !task.startDate || !task.endDate) return null;
                  
                  const isDragging = draggingTask === task.id;
                  const offset = daysBetween(
                    timelineStart,
                    isDragging ? addDays(task.startDate, dragDelta) : task.startDate
                  );
                  const left = offset * zoom.dayWidth;

                  return task.dependsOn.split(',').map((depId) => {
                    if (depId.trim() === task.id) return null;
                    
                    const depTask = projectTasks.find((t) => t.id === depId.trim());
                    if (!depTask || !depTask.endDate) return null;
                    
                    const depIsDragging = draggingTask === depTask.id;
                    const depIsResizing = draggingTask === depTask.id + '-resize';
                    const depEndDate = depIsResizing ? addDays(depTask.endDate, dragDelta) : (depIsDragging ? addDays(depTask.endDate, dragDelta) : depTask.endDate);
                    
                    const depEndPx = daysBetween(timelineStart, depEndDate) * zoom.dayWidth + zoom.dayWidth;
                    
                    const depRow = projectTasks.indexOf(depTask);
                    const curRow = projectTasks.indexOf(task);
                    const rowH = 40;
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
                        stroke={isCriticalDep ? '#ef4444' : '#8ba1b7'}
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
            
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!modalTaskData.isBlocked}
                  onChange={(e) => setModalTaskData({ ...modalTaskData, isBlocked: e.target.checked })}
                />
                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Sinalizar Impedimento</span>
              </label>
              {modalTaskData.isBlocked && (
                <input
                  type="text"
                  placeholder="Motivo do impedimento..."
                  value={modalTaskData.blockReason || ''}
                  onChange={(e) => setModalTaskData({ ...modalTaskData, blockReason: e.target.value })}
                  style={{ marginTop: '8px', borderLeft: '3px solid var(--color-danger)' }}
                />
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setModalTask(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveModal}>Salvar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
