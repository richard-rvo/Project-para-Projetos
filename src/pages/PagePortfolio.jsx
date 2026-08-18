import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import ViewBar, { ViewBarSegments, ViewBarButton } from '../components/shell/ViewBar';
import ConfirmDialog from '../components/ConfirmDialog';
import PortfolioTimeline from '../components/PortfolioTimeline';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { calculateProjectMetrics } from '../utils/progress';
import { today, addDays, formatDateLong } from '../utils/schedule';
import { countByStage, isDueWithin, projectSpan } from '../utils/taskState';
import {
  Plus, Search, LayoutGrid, Table2, GanttChartSquare, Trash2, FolderOpen,
  CalendarRange,
} from 'lucide-react';

function generateId() {
  return Date.now() + Math.random().toString(36).slice(2, 9);
}

const MODES = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Tabela', icon: Table2 },
  { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
];

const STATUS_TONE = {
  Planejado: 'bg-sched-not-started-soft text-sched-not-started',
  'Em Andamento': 'bg-sched-on-track-soft text-sched-on-track',
  Concluído: 'bg-sched-done-soft text-sched-done',
  Atrasado: 'bg-sched-late-soft text-sched-late',
  Pausado: 'bg-sched-not-started-soft text-sched-not-started',
};

const HEALTH_DOT = {
  Boa: 'bg-sched-done',
  Atenção: 'bg-sched-at-risk',
  Crítica: 'bg-sched-late',
  'Sem base': 'bg-sched-not-started',
};

/**
 * Portfólio — a fusão de Dashboard e Projetos.
 *
 * Eram duas telas mostrando a mesma coisa: KPIs de topo + saúde dos
 * projetos. Agora é uma, com modos de visualização em vez de rotas
 * separadas.
 *
 * A faixa de métricas troca os cinco cards com ícone colorido por
 * números grandes em tipografia — número é o dado, o ícone era enfeite.
 */
export default function PagePortfolio() {
  const { state, addProject, removeProject, selectProject, showToast } =
    useContext(AppContext);

  const [mode, setMode] = useState('cards');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', startDate: '', endDate: '', status: 'Planejado',
  });

  const { projects, tasks, anomalies } = state;

  /* Métricas por projeto, calculadas uma vez só. */
  const rows = useMemo(() => {
    return projects.map((p) => {
      const projTasks = tasks.filter((t) => t.projectId === p.id);
      return {
        project: p,
        metrics: calculateProjectMetrics(projTasks),
        span: projectSpan(projTasks),
        lateCount: countByStage(projTasks).late,
        taskCount: projTasks.length,
        openAnomalies: anomalies.filter(
          (a) => a.projectId === p.id && a.status === 'aberta'
        ).length,
      };
    });
  }, [projects, tasks, anomalies]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.project.name.toLowerCase().includes(q));
  }, [rows, query]);

  /* Faixa de métricas do portfólio inteiro. */
  const summary = useMemo(() => {
    const active = projects.filter((p) => p.status === 'Em Andamento').length;
    const avg = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.metrics.progress, 0) / rows.length)
      : 0;
    /* Antes contava por um status que ninguém atribuía: este número
       era sempre zero, num portfólio cheio de tarefas vencidas. */
    const dueSoon = tasks.filter((t) => isDueWithin(t, 7)).length;
    const late = countByStage(tasks).late;
    const openAnoms = anomalies.filter((a) => a.status === 'aberta').length;
    return { total: projects.length, active, avg, dueSoon, late, openAnoms };
  }, [projects, tasks, anomalies, rows]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showToast('Nome do projeto é obrigatório', 'error');
      return;
    }
    await addProject({ id: generateId(), ...form, createdAt: new Date().toISOString() });
    setForm({ name: '', description: '', startDate: '', endDate: '', status: 'Planejado' });
    setCreateOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <ViewBarSegments options={MODES} value={mode} onChange={setMode} />

        <label className="relative ml-1 flex items-center">
          <Search size={14} strokeWidth={1.8} className="absolute left-2.5 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar projetos"
            className={cn(
              'h-7.5 w-56 rounded-[6px] border border-line bg-surface-0 pl-8 pr-2.5',
              'text-small text-text-1 placeholder:text-text-3',
              'transition-colors duration-100 focus:border-line-strong'
            )}
          />
        </label>

        <div className="ml-auto" />

        <ViewBarButton icon={Plus} variant="primary" onClick={() => setCreateOpen(true)}>
          Novo Projeto
        </ViewBarButton>
      </ViewBar>

      <div className="min-h-0 flex-1 overflow-auto">
        <MetricsStrip summary={summary} />

        <div className="p-5">
          {visible.length === 0 ? (
            <EmptyState
              hasProjects={projects.length > 0}
              onCreate={() => setCreateOpen(true)}
            />
          ) : mode === 'cards' ? (
            <CardsGrid rows={visible} onOpen={selectProject} onDelete={setConfirmId} />
          ) : mode === 'timeline' ? (
            <PortfolioTimeline rows={visible} onOpen={selectProject} />
          ) : (
            <ProjectsTable rows={visible} onOpen={selectProject} onDelete={setConfirmId} />
          )}
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        setForm={setForm}
        onCreate={handleCreate}
      />

      <ConfirmDialog
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => removeProject(confirmId)}
        title="Excluir Projeto"
        message="Tem certeza que deseja excluir este projeto? Todas as tarefas associadas serão removidas."
      />
    </div>
  );
}

/* ── Faixa de métricas ───────────────────────────────────────────── */

function MetricsStrip({ summary }) {
  const items = [
    { label: 'Projetos', value: summary.total },
    { label: 'Em andamento', value: summary.active },
    { label: 'Progresso médio', value: `${summary.avg}%` },
    { label: 'Vencendo em 7d', value: summary.dueSoon, tone: summary.dueSoon > 0 ? 'at-risk' : null },
    { label: 'Tarefas atrasadas', value: summary.late, tone: summary.late > 0 ? 'late' : null },
    { label: 'Anomalias abertas', value: summary.openAnoms, tone: summary.openAnoms > 0 ? 'late' : null },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-px border-b border-line bg-line">
      {items.map((it) => (
        <div key={it.label} className="flex min-w-40 flex-1 flex-col gap-0.5 bg-surface-1 px-5 py-3.5">
          <span className="text-micro font-medium uppercase tracking-wide text-text-3">
            {it.label}
          </span>
          <span
            className={cn(
              'text-[26px] font-semibold leading-none tracking-tight tabular-nums',
              it.tone === 'late' ? 'text-sched-late'
                : it.tone === 'at-risk' ? 'text-sched-at-risk'
                  : 'text-text-1'
            )}
          >
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Cards ───────────────────────────────────────────────────────── */

function CardsGrid({ rows, onOpen, onDelete }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
      {rows.map(({ project, metrics, span, lateCount, taskCount, openAnomalies }) => (
        <article
          key={project.id}
          onClick={() => onOpen(project.id)}
          className={cn(
            'group cursor-pointer rounded-[10px] border border-line bg-surface-1 p-4',
            'transition-all duration-150 hover:border-line-strong hover:shadow-elev-2'
          )}
        >
          <div className="flex items-start gap-2">
            <span
              className={cn('mt-1.5 size-2 shrink-0 rounded-full', HEALTH_DOT[metrics.health])}
              title={`Saúde: ${metrics.health}`}
            />
            <h3 className="min-w-0 flex-1 truncate text-read font-semibold tracking-tight text-text-1">
              {project.name}
            </h3>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
              title="Excluir projeto"
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-[6px] text-text-3',
                'opacity-0 transition-all duration-100 group-hover:opacity-100',
                'hover:bg-sched-late-soft hover:text-sched-late'
              )}
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          </div>

          {project.description && (
            <p className="mt-1.5 line-clamp-2 text-small leading-relaxed text-text-2">
              {project.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Pill className={STATUS_TONE[project.status] || STATUS_TONE.Planejado}>
              {project.status || 'Planejado'}
            </Pill>
            <Pill className="bg-surface-3 text-text-2">
              {taskCount} tarefa{taskCount !== 1 ? 's' : ''}
            </Pill>
            {lateCount > 0 && (
              <Pill className="bg-sched-late-soft text-sched-late">
                {lateCount} atrasada{lateCount !== 1 ? 's' : ''}
              </Pill>
            )}
            {openAnomalies > 0 && (
              <Pill className="bg-sched-at-risk-soft text-sched-at-risk">
                {openAnomalies} anomalia{openAnomalies !== 1 ? 's' : ''}
              </Pill>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-micro font-medium uppercase tracking-wide text-text-3">
                Progresso
              </span>
              <span className="text-small font-semibold tabular-nums text-text-1">
                {metrics.progress}%
              </span>
            </div>
            <ProgressTrack value={metrics.progress} planned={metrics.planned} />
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-micro text-text-3">
            <CalendarRange size={12} strokeWidth={1.8} />
            <span className="tabular-nums" title="Período real, calculado das tarefas">
              {formatDateLong(span.start)} → {formatDateLong(span.end)}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ── Tabela ──────────────────────────────────────────────────────── */

function ProjectsTable({ rows, onOpen, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-surface-1">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-line">
            {['Projeto', 'Status', 'Saúde', 'Progresso', 'Tarefas', 'Período', ''].map((h, i) => (
              <th
                key={h || i}
                className={cn(
                  'px-3 py-2.5 text-micro font-semibold uppercase tracking-wide text-text-3',
                  i === 0 ? 'text-left' : i === 6 ? 'w-10' : 'text-left'
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ project, metrics, span, taskCount }) => (
            <tr
              key={project.id}
              onClick={() => onOpen(project.id)}
              className="group cursor-pointer border-b border-line last:border-0 transition-colors duration-100 hover:bg-surface-2"
            >
              <td className="max-w-0 px-3 py-2.5">
                <span className="block truncate text-body font-medium text-text-1">
                  {project.name}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <Pill className={STATUS_TONE[project.status] || STATUS_TONE.Planejado}>
                  {project.status || 'Planejado'}
                </Pill>
              </td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-small text-text-2">
                  <span className={cn('size-2 rounded-full', HEALTH_DOT[metrics.health])} />
                  {metrics.health}
                </span>
              </td>
              <td className="w-44 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <ProgressTrack value={metrics.progress} planned={metrics.planned} />
                  <span className="w-9 shrink-0 text-right text-small font-semibold tabular-nums text-text-1">
                    {metrics.progress}%
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-small tabular-nums text-text-2">{taskCount}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-small tabular-nums text-text-2">
                {formatDateLong(span.start)} → {formatDateLong(span.end)}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
                  title="Excluir projeto"
                  className={cn(
                    'grid size-7 place-items-center rounded-[6px] text-text-3',
                    'opacity-0 transition-all duration-100 group-hover:opacity-100',
                    'hover:bg-sched-late-soft hover:text-sched-late'
                  )}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Peças ───────────────────────────────────────────────────────── */

function Pill({ children, className }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-micro font-medium', className)}>
      {children}
    </span>
  );
}

/**
 * Barra de progresso do projeto — um dos quatro lugares onde o
 * gradiente da marca é permitido.
 * O traço do planejado revela o desvio sem precisar de um segundo número.
 */
function ProgressTrack({ value, planned }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.min(100, value)}%`, background: 'var(--brand-gradient)' }}
      />
      {planned !== null && planned > 0 && planned < 100 && (
        <span
          className="absolute inset-y-0 w-px bg-text-3"
          style={{ left: `${Math.min(100, planned)}%` }}
          title={`Planejado hoje: ${planned}%`}
        />
      )}
    </div>
  );
}

function EmptyState({ hasProjects, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <FolderOpen size={40} strokeWidth={1.2} className="text-text-3" />
      <div>
        <h3 className="text-read font-semibold text-text-1">
          {hasProjects ? 'Nenhum projeto corresponde ao filtro' : 'Nenhum projeto ainda'}
        </h3>
        <p className="mt-1 text-small text-text-2">
          {hasProjects
            ? 'Ajuste o texto da busca para ver outros projetos.'
            : 'Crie o primeiro projeto para começar a planejar.'}
        </p>
      </div>
      {!hasProjects && (
        <ViewBarButton icon={Plus} variant="primary" onClick={onCreate}>
          Criar Projeto
        </ViewBarButton>
      )}
    </div>
  );
}

/* ── Criação ─────────────────────────────────────────────────────── */

const fieldCls =
  'h-8 w-full rounded-[6px] border border-line bg-surface-0 px-2.5 text-body text-text-1 ' +
  'placeholder:text-text-3 transition-colors duration-100 focus:border-line-strong';

function CreateProjectDialog({ open, onOpenChange, form, setForm, onCreate }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label="Nome do projeto" required>
            <input
              autoFocus
              className={fieldCls}
              value={form.name}
              onChange={set('name')}
              placeholder="Ex: Parada de Manutenção — Coqueria"
            />
          </Field>

          <Field label="Descrição">
            <textarea
              rows={3}
              className={cn(fieldCls, 'h-auto py-2 leading-relaxed')}
              value={form.description}
              onChange={set('description')}
              placeholder="O que este projeto entrega?"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <input type="date" className={fieldCls} value={form.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Término">
              <input type="date" className={fieldCls} value={form.endDate} onChange={set('endDate')} />
            </Field>
          </div>

          <Field label="Status">
            <select className={fieldCls} value={form.status} onChange={set('status')}>
              <option>Planejado</option>
              <option>Em Andamento</option>
              <option>Concluído</option>
              <option>Pausado</option>
            </select>
          </Field>
        </div>

        <DialogFooter>
          <ViewBarButton onClick={() => onOpenChange(false)}>Cancelar</ViewBarButton>
          <ViewBarButton variant="primary" onClick={onCreate}>Criar Projeto</ViewBarButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">
        {label}
        {required && <span className="ml-0.5 text-sched-late">*</span>}
      </span>
      {children}
    </label>
  );
}
