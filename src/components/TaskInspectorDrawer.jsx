import React, { useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import {
  X, Calendar, Clock, Users, Link2, FileText, Trash2,
  AlertTriangle, Indent, Outdent, Target, TrendingUp,
} from 'lucide-react';
import {
  addDays, durationDays, formatDateShort, clampProgress, isMilestone, daysBetween,
} from '../utils/schedule';
import { calculateTaskPlannedProgress } from '../utils/progress';
import { applyForwardPass, stripComputed } from '../views/gantt/useGanttTasks';

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

  const predecessorLabel = useCallback((dependsOn) => {
    if (!dependsOn) return '';
    return String(dependsOn).split(',')
      .map((id) => siblings.findIndex((t) => t.id === id.trim()))
      .filter((i) => i >= 0).map((i) => i + 1).join(', ');
  }, [siblings]);

  const predecessorFromLabel = useCallback((label) => {
    if (!label?.trim()) return '';
    return String(label).split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n))
      .map((n) => siblings[n - 1]?.id)
      .filter((id) => id && id !== task?.id)
      .join(',');
  }, [siblings, task]);

  const commit = useCallback(async (patch, label) => {
    if (!task) return;
    const next = { ...task, ...patch };
    const reschedules = 'startDate' in patch || 'endDate' in patch || 'dependsOn' in patch;
    const list = reschedules ? applyForwardPass(next, siblings) : [next];
    await updateTasksBatch(list.map(stripComputed), label);
  }, [task, siblings, updateTasksBatch]);

  if (!inspectorTaskId || !draft || !task) return null;

  const project = projects.find((p) => p.id === task.projectId);
  const linked = anomalies.filter((a) => a.taskId === task.id);
  const duration = durationDays(task.startDate, task.endDate);
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
            <div className="grid grid-cols-2 gap-2">
              <Field label="Início">
                <input
                  type="date"
                  value={draft.startDate || ''}
                  disabled={task.isSummary}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.startDate && commit({ startDate: e.target.value }, 'Alterar início')}
                  className={inputCls}
                />
              </Field>
              <Field label="Término">
                <input
                  type="date"
                  value={draft.endDate || ''}
                  disabled={task.isSummary}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  onBlur={(e) => e.target.value !== task.endDate && commit({ endDate: e.target.value }, 'Alterar término')}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Duração (dias)" className="mt-2">
              <input
                type="number"
                min="1"
                value={duration || 1}
                disabled={task.isSummary}
                onChange={(e) => {
                  /* Duração não é armazenada: ela desloca o término. */
                  const days = Math.max(1, parseInt(e.target.value, 10) || 1);
                  setDraft({ ...draft, endDate: addDays(task.startDate, days - 1) });
                }}
                onBlur={() => draft.endDate !== task.endDate && commit({ endDate: draft.endDate }, 'Alterar duração')}
                className={inputCls}
              />
            </Field>
          </Section>

          <Section label="Predecessoras" icon={Link2}>
            <input
              value={draft.__predLabel ?? predecessorLabel(task.dependsOn)}
              onChange={(e) => setDraft({ ...draft, __predLabel: e.target.value })}
              onBlur={(e) => {
                const next = predecessorFromLabel(e.target.value);
                setDraft((d) => ({ ...d, __predLabel: undefined }));
                if (next !== (task.dependsOn || '')) commit({ dependsOn: next }, 'Alterar predecessoras');
              }}
              placeholder="Números de linha — ex: 1, 3"
              className={inputCls}
            />
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
                  {formatDateShort(task.baselineStart)} → {formatDateShort(task.baselineEnd)}
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
