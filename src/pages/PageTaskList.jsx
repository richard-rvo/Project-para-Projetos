import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarButton, ViewBarDivider } from '../components/shell/ViewBar';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Search, SlidersHorizontal, Trash2, CheckCheck, ArrowUpDown, ListChecks, X,
} from 'lucide-react';
import { COLUMNS } from '../views/gantt/ganttConfig';
import {
  STAGES, stageOf, stageLabel, isLate, lateDays, viewStart, viewEnd, viewProgress,
} from '../utils/taskState';
import { today, SCHEDULE_MODES } from '../utils/schedule';
import {
  calendarOf, calendarsOf, defaultCalendarOf, workdayStart,
} from '../utils/calendar';
import { addWorkingMinutes, workingMinutesBetween, minutesPerDay } from '../utils/worktime';
import { formatDuration } from '../utils/duration';

/* ═══════════════════════════════════════════════════════════════
   TABELA DE TAREFAS

   Consome a MESMA definição de colunas do Gantt
   (ganttConfig.COLUMNS). Antes as duas telas mantinham listas
   próprias e divergiam — a lista mostrava "Responsável", o Gantt
   mostrava "Recursos", e nenhuma mostrava o que a outra mostrava.

   Aqui a ordenação faz sentido, diferente do Gantt: numa lista plana
   a ordem é uma pergunta ("o que vence primeiro?"), enquanto no Gantt
   a ordem das linhas É o plano.
   ═══════════════════════════════════════════════════════════════ */

const STAGE_TONE = {
  'not-started': 'bg-sched-not-started-soft text-sched-not-started',
  'in-progress': 'bg-sched-on-track-soft text-sched-on-track',
  done: 'bg-sched-done-soft text-sched-done',
};

const SORTABLE = {
  name: (t) => String(t.name || '').toLowerCase(),
  start: (t) => viewStart(t) || '',
  end: (t) => viewEnd(t) || '',
  progress: (t) => viewProgress(t),
  duration: (t) => t.__durationMinutes ?? 0,
  stage: (t) => stageOf(t),
  resources: (t) => String(t.resources || '').toLowerCase(),
};

/**
 * Contexto das colunas do Gantt, com as MESMAS funções que o Gantt usa.
 *
 * Antes esta tela tinha um esboço próprio que contava dias corridos
 * enquanto o Gantt contava dias úteis: a mesma tarefa aparecia com
 * "16d" aqui e "12d" lá, e não havia como saber qual estava certa.
 */
function cellCtx(project) {
  const calendarFor = (t) => calendarOf(project, t);
  return {
    calendars: calendarsOf(project),
    projectCalendarName: defaultCalendarOf(project).name,
    calendarFor,
    calendarLabel: (t) => (t.calendarId ? calendarFor(t).name : ''),
    durationLabel: (t) =>
      formatDuration(
        workingMinutesBetween(calendarFor(t), viewStart(t), viewEnd(t)),
        calendarFor(t)
      ),
    predecessorLabel: () => '',
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function PageTaskList() {
  const { state, addTask, updateTasksBatch, removeTasks, openTaskInspector, showToast } =
    useContext(AppContext);

  const [query, setQuery] = useState('');
  const [stages, setStages] = useState([]);
  const [onlyLate, setOnlyLate] = useState(false);
  const [sort, setSort] = useState({ key: 'start', dir: 'asc' });
  const [selected, setSelected] = useState(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const projectId = state.activeProjectId;
  const project = state.projects.find((p) => p.id === projectId);

  const columns = useMemo(
    () => COLUMNS.filter((c) =>
      ['name', 'duration', 'start', 'end', 'progress', 'resources'].includes(c.id)),
    []
  );

  const total = useMemo(
    () => state.tasks.filter((t) => t.projectId === projectId).length,
    [state.tasks, projectId]
  );

  const ctx = useMemo(() => cellCtx(project), [project]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = state.tasks
      .filter((t) => {
        if (t.projectId !== projectId) return false;
        if (term && !String(t.name || '').toLowerCase().includes(term)) return false;
        if (stages.length && !stages.includes(stageOf(t))) return false;
        if (onlyLate && !isLate(t)) return false;
        return true;
      })
      /* Ordenar por duração exige compará-las na mesma unidade, e
         "dias" não é a mesma unidade em calendários diferentes. */
      .map((t) => ({
        ...t,
        __durationMinutes: workingMinutesBetween(
          ctx.calendarFor(t), viewStart(t), viewEnd(t)
        ),
      }));

    const read = SORTABLE[sort.key] || SORTABLE.start;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = read(a);
      const bv = read(b);
      if (av === bv) return (a.order ?? 0) - (b.order ?? 0);
      return (av > bv ? 1 : -1) * factor;
    });
  }, [state.tasks, projectId, query, stages, onlyLate, sort, ctx]);

  const toggleSort = (key) => setSort((prev) =>
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  );

  const toggleRow = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const allSelected = rows.length > 0 && rows.every((t) => selected.has(t.id));

  const addQuick = async () => {
    const cal = defaultCalendarOf(project);
    const start = workdayStart(cal, today());
    const task = {
      id: generateId(), projectId, name: 'Nova tarefa',
      startDate: start,
      endDate: addWorkingMinutes(cal, start, 5 * minutesPerDay(cal)),
      scheduleMode: SCHEDULE_MODES.AUTO,
      progress: 0, dependsOn: [],
      indentLevel: 0, order: total,
    };
    await addTask(task);
    openTaskInspector(task.id);
  };

  const completeSelected = async () => {
    const list = state.tasks
      .filter((t) => selected.has(t.id))
      /* Concluir é escrever 100%: o estágio é a leitura do progresso,
         não um campo à parte que poderia discordar dele. */
      .map((t) => ({ ...t, progress: 100 }));
    if (!list.length) return;
    await updateTasksBatch(list, 'Concluir tarefas');
    showToast(`${list.length} tarefa(s) concluída(s)`, 'success');
    setSelected(new Set());
  };

  if (!project) return null;

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <label className="relative flex items-center">
          <Search size={14} strokeWidth={1.8} className="absolute left-2.5 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar tarefas"
            className="h-7.5 w-56 rounded-[6px] border border-line bg-surface-0 pl-8 pr-2.5 text-small text-text-1 placeholder:text-text-3 focus:border-line-strong"
          />
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ViewBarButton
              icon={SlidersHorizontal}
              active={stages.length > 0 || onlyLate}
            >
              Estado{stages.length || onlyLate ? ` (${stages.length + (onlyLate ? 1 : 0)})` : ''}
            </ViewBarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
              Mostrar apenas
            </DropdownMenuLabel>
            {STAGES.map((stage) => (
              <DropdownMenuCheckboxItem
                key={stage.id}
                checked={stages.includes(stage.id)}
                onCheckedChange={() => setStages((prev) =>
                  prev.includes(stage.id)
                    ? prev.filter((x) => x !== stage.id)
                    : [...prev, stage.id])}
                onSelect={(e) => e.preventDefault()}
              >
                {stage.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={onlyLate}
              onCheckedChange={setOnlyLate}
              onSelect={(e) => e.preventDefault()}
            >
              Só atrasadas
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-1 text-micro tabular-nums text-text-3">
          {rows.length} de {total}
        </span>

        <div className="ml-auto" />
        <ViewBarButton icon={Plus} variant="primary" onClick={addQuick}>Tarefa</ViewBarButton>
      </ViewBar>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <ListChecks size={40} strokeWidth={1.2} className="text-text-3" />
            <div>
              <h3 className="text-read font-semibold text-text-1">Nenhuma tarefa encontrada</h3>
              <p className="mt-1 text-small text-text-2">Ajuste os filtros ou crie uma tarefa.</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-line bg-surface-3">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(rows.map((t) => t.id)))}
                    aria-label="Selecionar todas"
                  />
                </th>
                {columns.map((col) => (
                  <SortHeader
                    key={col.id}
                    label={col.label}
                    active={sort.key === col.id}
                    dir={sort.dir}
                    align={col.align}
                    onClick={() => toggleSort(col.id)}
                  />
                ))}
                <SortHeader
                  label="Estado"
                  active={sort.key === 'stage'}
                  dir={sort.dir}
                  onClick={() => toggleSort('stage')}
                />
                <th className="w-14 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr
                  key={task.id}
                  className={cn(
                    'group border-b border-line transition-colors last:border-0',
                    selected.has(task.id) ? 'bg-brand-soft' : 'hover:bg-surface-2'
                  )}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(task.id)}
                      onChange={() => toggleRow(task.id)}
                      aria-label={`Selecionar ${task.name}`}
                    />
                  </td>

                  {columns.map((col) => (
                    <td
                      key={col.id}
                      onClick={() => openTaskInspector(task.id)}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-body text-text-1',
                        col.align === 'center' && 'text-center tabular-nums',
                        col.id === 'name' && 'max-w-0 truncate font-medium'
                      )}
                    >
                      {col.id === 'name' ? task.name : col.render(task, ctx)}
                    </td>
                  ))}

                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-micro font-medium',
                        STAGE_TONE[stageOf(task)]
                      )}>
                        {stageLabel(task)}
                      </span>
                      {/* Atraso é condição: acompanha o estágio em vez
                          de substituí-lo. */}
                      {isLate(task) && (
                        <span
                          title={`${lateDays(task)} dia(s) além do término`}
                          className="rounded-full bg-sched-late-soft px-2 py-0.5 text-micro font-semibold tabular-nums text-sched-late"
                        >
                          {lateDays(task)}d
                        </span>
                      )}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeTasks([task.id])}
                      title="Excluir"
                      className="grid size-7 place-items-center rounded-[6px] text-text-3 opacity-0 transition-all group-hover:opacity-100 hover:bg-sched-late-soft hover:text-sched-late"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ações em massa: a barra só existe quando há seleção. */}
      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface-1 px-4 py-2.5">
          <span className="text-small font-medium tabular-nums text-text-1">
            {selected.size} selecionada{selected.size !== 1 ? 's' : ''}
          </span>
          <ViewBarDivider />
          <ViewBarButton icon={CheckCheck} onClick={completeSelected}>Concluir</ViewBarButton>
          <ViewBarButton icon={Trash2} onClick={() => setConfirmBulk(true)}>Excluir</ViewBarButton>
          <div className="ml-auto" />
          <ViewBarButton icon={X} onClick={() => setSelected(new Set())}>Limpar</ViewBarButton>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={async () => {
          await removeTasks([...selected]);
          setSelected(new Set());
          setConfirmBulk(false);
        }}
        title="Excluir tarefas"
        message={`Excluir ${selected.size} tarefa(s)? Use ⌘Z para desfazer.`}
      />
    </div>
  );
}

function SortHeader({ label, active, dir, onClick, align }) {
  return (
    <th
      onClick={onClick}
      className={cn(
        'cursor-pointer select-none px-3 py-2 text-micro font-semibold uppercase tracking-wide',
        'transition-colors hover:text-text-1',
        active ? 'text-text-1' : 'text-text-3',
        align === 'center' ? 'text-center' : 'text-left'
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          size={11}
          className={active ? 'opacity-100' : 'opacity-0'}
          style={active && dir === 'desc' ? { transform: 'scaleY(-1)' } : undefined}
        />
      </span>
    </th>
  );
}
