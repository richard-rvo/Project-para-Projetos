import React, { useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import {
  X, Calendar, Clock, Users, Link2, FileText, Trash2,
  AlertTriangle, Indent, Outdent, Target, TrendingUp,
} from 'lucide-react';
import {
  formatDateShort, formatDateTimeShort, clampProgress, isMilestone, daysBetween,
  isManual, SCHEDULE_MODES,
} from '../utils/schedule';
import { calculateTaskPlannedProgress } from '../utils/progress';
import { calendarOf, calendarsOf, defaultCalendarOf } from '../utils/calendar';
import {
  addWorkingMinutes, workingMinutesBetween, snapForward, minutesPerDay,
} from '../utils/worktime';
import { formatDuration, resolveDuration } from '../utils/duration';
import { applyForwardPass, stripComputed } from '../views/gantt/useGanttTasks';
import { analyseSchedule } from '../utils/cpm';
import {
  readDependencies, DEPENDENCY_TYPES, wouldCreateCycle,
} from '../utils/dependencies';

/* ═══════════════════════════════════════════════════════════════
   INSPECTOR — o único caminho de edição de detalhe de tarefa.

   Antes existiam três: célula inline, o Modal do Gantt e este
   drawer. E este era o pior dos três: nunca foi chamado por
   ninguém e escrevia em campos que não existem no modelo
   (`predecessors`, `resource`, `duration`, `isMilestone`, e status
   em snake_case). Se tivesse sido ligado, corromperia as tarefas.

   Agora ele fala o schema real e é a única superfície de detalhe.
   A edição inline na grade continua — ela cobre as colunas; o
   Inspector cobre o resto.

   Gravação por campo, ao confirmar: cada alteração vira uma entrada
   de histórico própria, então ⌘Z desfaz uma coisa de cada vez em
   vez de um bloco inteiro.
   ═══════════════════════════════════════════════════════════════ */

const STATUS_OPTIONS = [
  { id: 'Não Iniciada', tone: 'not-started' },
  { id: 'Em Andamento', tone: 'on-track' },
  { id: 'Concluída', tone: 'done' },
  { id: 'Atrasada', tone: 'late' },
];

const TONE_CLASS = {
  'not-started': 'data-[on=true]:bg-sched-not-started-soft data-[on=true]:text-sched-not-started',
  'on-track': 'data-[on=true]:bg-sched-on-track-soft data-[on=true]:text-sched-on-track',
  done: 'data-[on=true]:bg-sched-done-soft data-[on=true]:text-sched-done',
  late: 'data-[on=true]:bg-sched-late-soft data-[on=true]:text-sched-late',
};

export default function TaskInspectorDrawer() {
  const {
    state, updateTasksBatch, removeTask, closeTaskInspector, showToast,
  } = useContext(AppContext);

  const { inspectorTaskId, tasks, projects, anomalies } = state;
  const task = tasks.find((t) => t.id === inspectorTaskId);

  const project = projects.find((p) => p.id === task?.projectId);
  const [draft, setDraft] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setDraft(task ? { ...task } : null); }, [task]);

  useEffect(() => {
    if (!inspectorTaskId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeTaskInspector(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectorTaskId, closeTaskInspector]);

  /* Irmãos do mesmo projeto, na ordem da grade — as predecessoras são
     exibidas por número de linha, como no MS Project. */
  const siblings = useMemo(() => {
    if (!task) return [];
    return tasks
      .filter((t) => t.projectId === task.projectId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [tasks, task]);

  const links = readDependencies(task?.dependsOn);

  /* Candidatas a predecessora: irmãs que ainda não estão ligadas e que
     não fechariam ciclo. Filtrar aqui em vez de validar no clique é o
     que impede o seletor de oferecer uma opção que daria erro. */
  const candidates = useMemo(() => {
    if (!task) return [];
    const already = new Set(readDependencies(task.dependsOn).map((d) => d.id));
    return siblings
      .map((t, i) => ({ task: t, row: i + 1 }))
      .filter(({ task: cand }) =>
        cand.id !== task.id &&
        !already.has(cand.id) &&
        !wouldCreateCycle(cand.id, task.id, siblings)
      );
  }, [task, siblings]);

  const setLinks = useCallback(
    (next) => commit({ dependsOn: next }, 'Alterar predecessoras'),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [task, siblings]
  );

  const commit = useCallback(async (patch, label) => {
    if (!task) return;
    const next = { ...task, ...patch };
    const reschedules = 'startDate' in patch || 'endDate' in patch
      || 'dependsOn' in patch || 'scheduleMode' in patch || 'calendarId' in patch;
    const list = reschedules ? applyForwardPass(next, siblings, project) : [next];
    await updateTasksBatch(list.map(stripComputed), label);
  }, [task, siblings, project, updateTasksBatch]);

  /**
   * Editar o início DESLOCA a tarefa preservando a duração, e fixa o
   * modo manual quando ela tem predecessora — as mesmas duas regras da
   * grade. Gravar só o campo mudaria a duração em vez de mover a
   * tarefa, e sem virar manual o próximo recálculo desfaria a
   * digitação em silêncio.
   */
  const commitStart = useCallback(async (value) => {
    if (!task) return;
    const cal = calendarOf(project, task);
    const duration = workingMinutesBetween(cal, task.startDate, task.endDate);
    const start = snapForward(cal, value);
    if (!start) return;

    const patch = { startDate: start, endDate: addWorkingMinutes(cal, start, duration) };
    const becomesManual = !isManual(task) && readDependencies(task.dependsOn).length > 0;
    if (becomesManual) patch.scheduleMode = SCHEDULE_MODES.MANUAL;

    await commit(patch, 'Alterar início');
    if (becomesManual) {
      showToast('Tarefa agendada manualmente — não será movida pelas predecessoras', 'info');
    }
  }, [task, project, commit, showToast]);

  /** Trocar de calendário mantém o início e a duração EM DIAS, e
   *  recalcula o término: 3 dias num calendário 24h acabam antes de
   *  3 dias num de 8h. */
  const commitCalendar = useCallback(async (calendarId) => {
    if (!task) return;
    const from = calendarOf(project, task);
    const to = calendarOf(project, { calendarId });
    const days = workingMinutesBetween(from, task.startDate, task.endDate) / minutesPerDay(from);
    const start = snapForward(to, task.startDate);

    await commit({
      calendarId: calendarId || undefined,
      startDate: start,
      endDate: addWorkingMinutes(to, start, days * minutesPerDay(to)),
    }, 'Alterar calendário');
  }, [task, project, commit]);

  /* Aviso de violação: só existe em tarefa manual, e é medido pela
     MESMA análise que o Gantt usa — dois cálculos discordariam. */
  const violation = useMemo(() => {
    if (!task || !isManual(task)) return 0;
    return analyseSchedule(siblings, project).byId.get(task.id)?.violationMinutes || 0;
  }, [task, siblings, project]);

  if (!inspectorTaskId || !draft || !task) return null;

  const linked = anomalies.filter((a) => a.taskId === task.id);
  const calendar = calendarOf(project, task);
  const calendars = calendarsOf(project);
  const durationMinutes = workingMinutesBetween(calendar, task.startDate, task.endDate);
  const milestone = isMilestone(task);
  const planned = calculateTaskPlannedProgress(task.baselineStart, task.baselineEnd);
  const drift = task.baselineEnd && task.endDate ? daysBetween(task.baselineEnd, task.endDate) : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-[var(--overlay-scrim)] animate-in fade-in-0 duration-200"
        onClick={closeTaskInspector}
      />

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-full flex-col',
          'border-l border-line bg-surface-1 shadow-elev-4',
          'animate-in slide-in-from-right-2 fade-in-0 duration-200'
        )}
        role="dialog"
        aria-label="Detalhes da tarefa"
      >
        {/* ── Cabeçalho ──────────────────────────────────────── */}
        <header className="flex shrink-0 items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-micro text-text-3">
              <span className="truncate">{project?.name}</span>
              {milestone && (
                <span className="rounded-full bg-surface-3 px-1.5 py-px font-medium text-text-2">
                  Marco
                </span>
              )}
              {task.isSummary && (
                <span className="rounded-full bg-surface-3 px-1.5 py-px font-medium text-text-2">
                  Resumo
                </span>
              )}
            </div>
            <input
              value={draft.name || ''}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onBlur={(e) => e.target.value !== task.name && commit({ name: e.target.value }, 'Renomear tarefa')}
              className={cn(
                'w-full rounded-[6px] bg-transparent px-1.5 py-1 -mx-1.5',
                'text-read font-semibold tracking-tight text-text-1',
                'transition-colors hover:bg-surface-2 focus:bg-surface-2'
              )}
              placeholder="Nome da tarefa"
            />
          </div>
          <button
            type="button"
            onClick={closeTaskInspector}
            title="Fechar (Esc)"
            className="mt-1 grid size-7 shrink-0 place-items-center rounded-[6px] text-text-3 transition-colors hover:bg-surface-3 hover:text-text-1"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        {/* ── Corpo ──────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <Section label="Status">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-on={task.status === opt.id}
                  onClick={() => commit({ status: opt.id }, 'Alterar status')}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-small font-medium transition-colors',
                    'bg-surface-3 text-text-2 hover:text-text-1',
                    TONE_CLASS[opt.tone]
                  )}
                >
                  {opt.id}
                </button>
              ))}
            </div>
          </Section>

          <Section
            label="Progresso"
            aside={<span className="text-small font-semibold tabular-nums text-text-1">{clampProgress(task.progress)}%</span>}
          >
            {task.isSummary ? (
              <p className="text-small text-text-3">
                Calculado a partir das subtarefas.
              </p>
            ) : (
              <>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={clampProgress(draft.progress)}
                  onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })}
                  onMouseUp={() => commit({ progress: clampProgress(draft.progress) }, 'Ajustar progresso')}
                  onKeyUp={() => commit({ progress: clampProgress(draft.progress) }, 'Ajustar progresso')}
                  className="w-full accent-[var(--brand)]"
                />
                <div className="mt-2 flex gap-1.5">
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => commit({ progress: pct }, 'Ajustar progresso')}
                      className={cn(
                        'flex-1 rounded-[6px] py-1 text-micro font-medium tabular-nums transition-colors',
                        clampProgress(task.progress) === pct
                          ? 'bg-brand-soft text-brand'
                          : 'bg-surface-3 text-text-2 hover:text-text-1'
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </>
            )}
          </Section>

          <Section label="Cronograma" icon={Calendar}>
            {/* Automática segue as predecessoras; manual fica onde o
                planejador colocou, e o Gantt avisa se isso desrespeitar
                a dependência — mas não move nada sozinho. */}
            <Field label="Modo de agendamento">
              <select
                value={isManual(task) ? SCHEDULE_MODES.MANUAL : SCHEDULE_MODES.AUTO}
                disabled={task.isSummary}
                onChange={(e) => commit({ scheduleMode: e.target.value }, 'Alterar modo de agendamento')}
                className={inputCls}
              >
                <option value={SCHEDULE_MODES.AUTO}>Automática — segue as predecessoras</option>
                <option value={SCHEDULE_MODES.MANUAL}>Manual — datas fixas</option>
              </select>
            </Field>

            {violation > 0 && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-[6px] bg-sched-late-soft px-2 py-1.5 text-micro text-sched-late">
                <AlertTriangle size={12} className="mt-px shrink-0" />
                <span>
                  Começa {formatDuration(violation, calendar)} antes do que a
                  predecessora permite. Por ser manual, ela não será movida.
                </span>
              </p>
            )}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Início">
                <input
                  type="datetime-local"
                  value={draft.startDate || ''}
                  disabled={task.isSummary}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.startDate && commitStart(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Término">
                <input
                  type="datetime-local"
                  value={draft.endDate || ''}
                  disabled={task.isSummary}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.endDate && commit({ endDate: e.target.value }, 'Alterar término')}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Duração">
                <input
                  type="text"
                  defaultValue={formatDuration(durationMinutes, calendar)}
                  disabled={task.isSummary}
                  placeholder="3d · 4h · 90m"
                  title="Aceita 3d, 4h ou 90m"
                  onBlur={(e) => {
                    /* Duração não é armazenada: ela desloca o término.
                       A leitura é a mesma da grade — antes esta tela
                       somava dias corridos e a grade, dias úteis. */
                    const minutes = resolveDuration(e.target.value, calendar, durationMinutes);
                    if (minutes === null || minutes === durationMinutes) return;
                    commit(
                      { endDate: addWorkingMinutes(calendar, task.startDate, minutes) },
                      'Alterar duração'
                    );
                  }}
                  className={inputCls}
                />
              </Field>
              <Field label="Calendário">
                <select
                  value={draft.calendarId || ''}
                  disabled={task.isSummary}
                  onChange={(e) => commitCalendar(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Do projeto ({defaultCalendarOf(project).name})</option>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section label="Predecessoras" icon={Link2}>
            {links.length === 0 ? (
              <p className="text-small text-text-3">
                Nenhuma. Escolha uma tarefa abaixo, ou digite na coluna Pred. do
                Gantt (ex.: <span className="tabular-nums">2FS+3</span>).
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {links.map((dep, i) => {
                  const row = siblings.findIndex((t) => t.id === dep.id);
                  const pred = siblings[row];
                  return (
                    <li key={dep.id} className="flex items-center gap-1.5">
                      <span className="w-6 shrink-0 text-right text-micro tabular-nums text-text-3">
                        {row >= 0 ? row + 1 : "?"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-small text-text-1">
                        {pred?.name || "(fora deste projeto)"}
                      </span>
                      <select
                        value={dep.type}
                        onChange={(e) => setLinks(links.map((d, j) =>
                          j === i ? { ...d, type: e.target.value } : d))}
                        title={DEPENDENCY_TYPES.find((t) => t.id === dep.type)?.hint}
                        className="h-7 shrink-0 rounded-[5px] border border-line bg-surface-0 px-1 text-micro text-text-1"
                      >
                        {DEPENDENCY_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>{t.id}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={dep.lag}
                        onChange={(e) => setLinks(links.map((d, j) =>
                          j === i ? { ...d, lag: parseInt(e.target.value, 10) || 0 } : d))}
                        title="Defasagem em dias úteis"
                        className="h-7 w-14 shrink-0 rounded-[5px] border border-line bg-surface-0 px-1.5 text-micro tabular-nums text-text-1"
                      />
                      <button
                        type="button"
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                        title="Remover"
                        className="grid size-6 shrink-0 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-sched-late-soft hover:text-sched-late"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Único caminho de criação por apontamento — o arrasto na
                ponta da barra saiu do Gantt. Só entram candidatas que não
                fecham ciclo, então não existe opção que dê erro. */}
            {candidates.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setLinks([...links, { id: e.target.value, type: 'FS', lag: 0 }]);
                }}
                className={cn(inputCls, 'mt-2 cursor-pointer')}
              >
                <option value="">Adicionar predecessora…</option>
                {candidates.map(({ task: cand, row }) => (
                  <option key={cand.id} value={cand.id}>
                    {row}. {cand.name}
                  </option>
                ))}
              </select>
            )}
          </Section>

          <Section label="Recursos" icon={Users}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Equipe">
                <input
                  value={draft.resources || ''}
                  onChange={(e) => setDraft({ ...draft, resources: e.target.value })}
                  onBlur={(e) => e.target.value !== (task.resources || '') && commit({ resources: e.target.value }, 'Alterar recursos')}
                  placeholder="2 Mecânicos"
                  className={inputCls}
                />
              </Field>
              <Field label="Grupo">
                <input
                  value={draft.resourceGroup || ''}
                  onChange={(e) => setDraft({ ...draft, resourceGroup: e.target.value })}
                  onBlur={(e) => e.target.value !== (task.resourceGroup || '') && commit({ resourceGroup: e.target.value }, 'Alterar grupo')}
                  placeholder="Engenharia"
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section label="Hierarquia" icon={Indent}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => commit({ indentLevel: Math.max(0, (task.indentLevel || 0) - 1) }, 'Alterar hierarquia')}
                disabled={(task.indentLevel || 0) === 0}
                className={btnCls}
              >
                <Outdent size={14} /> Recuar
              </button>
              <button
                type="button"
                onClick={() => commit({ indentLevel: (task.indentLevel || 0) + 1 }, 'Alterar hierarquia')}
                className={btnCls}
              >
                <Indent size={14} /> Avançar
              </button>
              <span className="ml-auto text-micro tabular-nums text-text-3">
                Nível {task.indentLevel || 0}
              </span>
            </div>
          </Section>

          {(task.baselineStart || task.baselineEnd) && (
            <Section label="Linha de base" icon={Target}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
                <dt className="text-text-3">Planejado</dt>
                <dd className="text-right tabular-nums text-text-1">
                  {formatDateTimeShort(task.baselineStart)} → {formatDateTimeShort(task.baselineEnd)}
                </dd>
                <dt className="text-text-3">% planejada hoje</dt>
                <dd className="text-right tabular-nums text-text-1">{planned}%</dd>
                {drift !== null && (
                  <>
                    <dt className="text-text-3">Desvio</dt>
                    <dd className={cn(
                      'text-right font-medium tabular-nums',
                      drift > 0 ? 'text-sched-late' : drift < 0 ? 'text-sched-done' : 'text-text-1'
                    )}>
                      {drift > 0 ? `+${drift}d` : `${drift}d`}
                    </dd>
                  </>
                )}
              </dl>
            </Section>
          )}

          <Section label="Observações" icon={FileText}>
            <textarea
              rows={3}
              value={draft.notes || ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              onBlur={(e) => e.target.value !== (task.notes || '') && commit({ notes: e.target.value }, 'Alterar observações')}
              placeholder="Contexto, riscos, decisões…"
              className={cn(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
            />
          </Section>

          {linked.length > 0 && (
            <Section label={`Anomalias vinculadas (${linked.length})`} icon={AlertTriangle}>
              <ul className="flex flex-col gap-1.5">
                {linked.map((a) => (
                  <li key={a.id} className="rounded-[6px] border border-line bg-surface-2 px-2.5 py-2">
                    <div className="truncate text-small font-medium text-text-1">{a.title}</div>
                    <div className="mt-0.5 flex gap-2 text-micro text-text-3">
                      <span>{a.severity}</span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* ── Rodapé ─────────────────────────────────────────── */}
        <footer className="flex shrink-0 items-center justify-between border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-small font-medium text-sched-late transition-colors hover:bg-sched-late-soft"
          >
            <Trash2 size={14} /> Excluir
          </button>
          <span className="text-micro text-text-3">Alterações salvas automaticamente</span>
        </footer>
      </aside>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await removeTask(task.id);
          showToast('Tarefa excluída', 'info');
          setConfirmDelete(false);
          closeTaskInspector();
        }}
        title="Excluir tarefa"
        message={`Excluir "${task.name}"? Use ⌘Z para desfazer.`}
      />
    </>
  );
}

/* ── Peças ─────────────────────────────────────────────────────── */

const inputCls =
  'h-8 w-full rounded-[6px] border border-line bg-surface-0 px-2.5 text-body text-text-1 ' +
  'placeholder:text-text-3 transition-colors focus:border-line-strong ' +
  'disabled:cursor-not-allowed disabled:text-text-3';

const btnCls =
  'flex items-center gap-1.5 rounded-[6px] border border-line px-2.5 py-1.5 text-small ' +
  'font-medium text-text-2 transition-colors hover:bg-surface-3 hover:text-text-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-45';

function Section({ label, icon: Icon, aside, children }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon size={13} strokeWidth={1.8} className="text-text-3" />}
        <h3 className="text-micro font-semibold uppercase tracking-wide text-text-3">{label}</h3>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, className, children }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-micro text-text-3">{label}</span>
      {children}
    </label>
  );
}
