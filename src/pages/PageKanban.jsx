import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarButton } from '../components/shell/ViewBar';
import { Plus, Columns3, CalendarDays, Users } from 'lucide-react';
import { STATUS_OPTIONS } from '../views/gantt/ganttConfig';
import { viewProgress } from '../views/gantt/useGanttTasks';
import { today, addDays, formatDateShort, durationDays } from '../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   QUADRO

   Uma coluna por status, com contador e limite visual de carga.
   Arrastar entre colunas muda o status — é a única edição que um
   quadro deve fazer; o resto vai para o Inspector.
   ═══════════════════════════════════════════════════════════════ */

const COLUMN_TONE = {
  'Não Iniciada': 'bg-sched-not-started',
  'Em Andamento': 'bg-sched-on-track',
  'Concluída': 'bg-sched-done',
  'Atrasada': 'bg-sched-late',
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function PageKanban() {
  const { state, addTask, updateTasksBatch, openTaskInspector } = useContext(AppContext);
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  const projectId = state.activeProjectId;
  const tasks = useMemo(
    () => state.tasks.filter((t) => t.projectId === projectId),
    [state.tasks, projectId]
  );

  const byStatus = useMemo(() => {
    const map = new Map(STATUS_OPTIONS.map((s) => [s, []]));
    tasks.forEach((t) => {
      const key = map.has(t.status) ? t.status : 'Não Iniciada';
      map.get(key).push(t);
    });
    return map;
  }, [tasks]);

  const drop = async (status) => {
    setOverColumn(null);
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;

    /* Mover para Concluída marca 100%: um card em "Concluída" com 40%
       é uma contradição que o usuário teria de corrigir à mão. */
    const patch = { ...task, status };
    if (status === 'Concluída') patch.progress = 100;
    await updateTasksBatch([patch], 'Mover no quadro');
  };

  const addTo = async (status) => {
    const start = today();
    const task = {
      id: generateId(), projectId, name: 'Nova tarefa',
      startDate: start, endDate: addDays(start, 4),
      status, progress: status === 'Concluída' ? 100 : 0,
      dependsOn: [], indentLevel: 0, order: tasks.length,
    };
    await addTask(task);
    openTaskInspector(task.id);
  };

  if (!state.projects.find((p) => p.id === projectId)) return null;

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <Columns3 size={14} strokeWidth={1.8} className="text-text-3" />
        <span className="text-small text-text-2">
          {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} em {STATUS_OPTIONS.length} colunas
        </span>
      </ViewBar>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex h-full min-h-0 gap-3">
          {STATUS_OPTIONS.map((status) => {
            const items = byStatus.get(status) || [];
            return (
              <section
                key={status}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(status); }}
                onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
                onDrop={() => drop(status)}
                className={cn(
                  'flex min-w-64 flex-1 flex-col rounded-[10px] border bg-surface-2 transition-colors',
                  overColumn === status
                    ? 'border-brand bg-brand-soft'
                    : 'border-line'
                )}
              >
                <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
                  <span className={cn('size-2 rounded-full', COLUMN_TONE[status])} />
                  <h2 className="text-body font-semibold text-text-1">{status}</h2>
                  <span className="rounded-full bg-surface-1 px-1.5 text-micro font-semibold tabular-nums text-text-3">
                    {items.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => addTo(status)}
                    title={`Nova tarefa em ${status}`}
                    className="ml-auto grid size-6 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-surface-1 hover:text-text-1"
                  >
                    <Plus size={14} />
                  </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-micro text-text-3">
                      Arraste tarefas para cá
                    </p>
                  ) : (
                    items.map((task) => (
                      <Card
                        key={task.id}
                        task={task}
                        dragging={dragId === task.id}
                        onDragStart={() => setDragId(task.id)}
                        onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                        onOpen={() => openTaskInspector(task.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({ task, dragging, onDragStart, onDragEnd, onOpen }) {
  const progress = viewProgress(task);
  const todayStr = today();
  const overdue = task.endDate && task.endDate < todayStr && task.status !== 'Concluída';
  const days = task.endDate ? durationDays(todayStr, task.endDate) - 1 : null;

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'cursor-pointer rounded-[8px] border border-line bg-surface-1 p-2.5',
        'transition-all hover:border-line-strong hover:shadow-elev-2',
        dragging && 'opacity-40'
      )}
    >
      <h3 className="line-clamp-2 text-small font-medium leading-snug text-text-1">
        {task.name}
      </h3>

      {task.resources && (
        <p className="mt-1.5 flex items-center gap-1 truncate text-micro text-text-3">
          <Users size={11} strokeWidth={1.8} /> {task.resources}
        </p>
      )}

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn('block h-full rounded-full', COLUMN_TONE[task.status] || 'bg-sched-not-started')}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-micro">
        <span className="tabular-nums text-text-3">{progress}%</span>
        {task.endDate && (
          <span className={cn(
            'flex items-center gap-1 tabular-nums',
            overdue ? 'font-semibold text-sched-late' : 'text-text-3'
          )}>
            <CalendarDays size={10} strokeWidth={1.8} />
            {overdue ? `${Math.abs(days)}d atrás` : formatDateShort(task.endDate)}
          </span>
        )}
      </div>
    </article>
  );
}
