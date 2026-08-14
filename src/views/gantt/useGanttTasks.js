import { useMemo, useCallback } from 'react';
import { addDays, durationDays } from '../../utils/schedule';
import { dependencyIds, readDependencies } from '../../utils/dependencies';
import {
  DEFAULT_CALENDAR, calendarOf, nextWorkingDay, workingDuration,
  endFromWorkingDuration, shiftWorkingDays,
} from '../../utils/calendar';
import { analyseSchedule } from '../../utils/cpm';

/* ═══════════════════════════════════════════════════════════════
   Regras de cronograma do Gantt: hierarquia, auto-agendamento e
   caminho crítico. Separado do render para poder ser lido e testado
   sem atravessar JSX.
   ═══════════════════════════════════════════════════════════════ */

/* ── Acessores de exibição ─────────────────────────────────────────
   Uma tarefa-resumo mostra os valores agregados dos filhos, mas
   GUARDA os seus próprios. Renderize sempre com estes acessores;
   grave sempre nos campos crus.                                    */

export const viewStart = (t) => t.rollup?.startDate ?? t.startDate;
export const viewEnd = (t) => t.rollup?.endDate ?? t.endDate;
export const viewProgress = (t) => t.rollup?.progress ?? t.progress ?? 0;

/**
 * Remove tudo que é derivado antes de persistir. Sem isso o rollup e
 * as marcas de hierarquia acabariam gravados no IndexedDB como se
 * fossem dados do usuário.
 */
export function stripComputed(task) {
  const { rollup, hasChildren, isSummary, ...stored } = task;
  return stored;
}

/** @deprecated Use dependencyIds de utils/dependencies. */
export const parseDependencies = dependencyIds;

/**
 * Tarefas do projeto, ordenadas, com resumo calculado de baixo para
 * cima: uma tarefa com filhos herda o menor início, o maior término e
 * o progresso ponderado por duração.
 *
 * Também marca `hasChildren` e `depth` para o render da hierarquia.
 */
export function useProjectTasks(allTasks, projectId, collapsedIds) {
  return useMemo(() => {
    const ordered = allTasks
      .filter((t) => t.projectId === projectId)
      .sort(
        (a, b) =>
          (a.order ?? 999) - (b.order ?? 999) ||
          String(a.startDate || '').localeCompare(String(b.startDate || ''))
      )
      .map((t) => ({ ...t }));

    /* Rollup de baixo para cima */
    for (let i = ordered.length - 1; i >= 0; i--) {
      const task = ordered[i];
      const level = task.indentLevel || 0;
      const children = [];

      for (let j = i + 1; j < ordered.length; j++) {
        const childLevel = ordered[j].indentLevel || 0;
        if (childLevel <= level) break;
        if (childLevel === level + 1) children.push(ordered[j]);
      }

      task.hasChildren = children.length > 0;
      task.isSummary = task.hasChildren;

      if (!task.hasChildren) continue;

      /* O rollup vai para um campo SEPARADO, nunca por cima de
         startDate/endDate/progress.

         Escrever direto nos campos era corrupção de dados silenciosa:
         qualquer edição partia deste clone, então virar tarefa-pai
         apagava as datas guardadas da tarefa e gravava as calculadas
         no lugar. Desindentá-la depois não as trazia de volta. */
      const starts = children.map((c) => viewStart(c)).filter(Boolean).sort();
      const ends = children.map((c) => viewEnd(c)).filter(Boolean).sort();

      let totalDur = 0;
      let earned = 0;
      children.forEach((c) => {
        const d = durationDays(viewStart(c), viewEnd(c)) || 1;
        totalDur += d;
        earned += d * viewProgress(c);
      });

      task.rollup = {
        startDate: starts[0] || task.startDate,
        endDate: ends[ends.length - 1] || task.endDate,
        progress: totalDur > 0 ? Math.round(earned / totalDur) : 0,
      };
    }

    /* Aplica o colapso: some com os descendentes de quem está fechado */
    if (!collapsedIds || collapsedIds.size === 0) return ordered;

    const visible = [];
    let hideBelowLevel = null;
    for (const task of ordered) {
      const level = task.indentLevel || 0;
      if (hideBelowLevel !== null && level > hideBelowLevel) continue;
      hideBelowLevel = null;
      visible.push(task);
      if (task.hasChildren && collapsedIds.has(task.id)) hideBelowLevel = level;
    }
    return visible;
  }, [allTasks, projectId, collapsedIds]);
}

/** Mapa predecessora → lista de sucessoras. */
function buildSuccessorMap(tasks) {
  const map = new Map();
  tasks.forEach((t) => {
    dependencyIds(t.dependsOn).forEach((depId) => {
      if (!map.has(depId)) map.set(depId, []);
      map.get(depId).push(t.id);
    });
  });
  return map;
}

/**
 * Auto-agendamento (forward pass) respeitando tipo de dependência,
 * defasagem e calendário de trabalho.
 *
 * Antes somava dias corridos e só entendia FS: mover uma tarefa que
 * terminava na sexta jogava a sucessora para o sábado.
 */
export function applyForwardPass(changedTask, allTasks, project) {
  const calendar = calendarOf(project);
  const updates = new Map([[changedTask.id, changedTask]]);
  const successors = buildSuccessorMap(allTasks);
  const queue = [changedTask];
  const visited = new Set();

  const current = (id) => updates.get(id) || allTasks.find((t) => t.id === id);

  while (queue.length) {
    const task = queue.shift();
    if (visited.has(task.id)) continue;
    visited.add(task.id);

    for (const succId of successors.get(task.id) || []) {
      const base = current(succId);
      if (!base || !base.startDate || !base.endDate) continue;
      /* Resumo é derivado dos filhos: empurrá-lo gravaria um valor
         calculado como se fosse do usuário. */
      if (base.hasChildren) continue;

      const link = readDependencies(base.dependsOn).find((d) => d.id === task.id);
      if (!link) continue;

      const pred = current(task.id);
      const duration = workingDuration(base.startDate, base.endDate, calendar);
      const lag = link.lag || 0;

      let start = null;
      let finish = null;

      switch (link.type) {
        case 'SS':
          start = shiftWorkingDays(nextWorkingDay(pred.startDate, calendar), lag, calendar);
          break;
        case 'FF':
          finish = shiftWorkingDays(pred.endDate, lag, calendar);
          break;
        case 'SF':
          finish = shiftWorkingDays(pred.startDate, lag, calendar);
          break;
        case 'FS':
        default:
          /* +1 porque o término é inclusivo: terminar na sexta libera
             a sucessora na segunda, não na própria sexta. */
          start = shiftWorkingDays(
            nextWorkingDay(addDays(pred.endDate, 1), calendar),
            lag,
            calendar
          );
          break;
      }

      if (finish && !start) {
        start = shiftWorkingDays(finish, -(duration - 1), calendar);
      }
      if (!start) continue;

      start = nextWorkingDay(start, calendar);
      if (base.constraintStart && start < base.constraintStart) {
        start = nextWorkingDay(base.constraintStart, calendar);
      }

      /* Só empurra para frente. Puxar de volta exigiria saber se a
         folga é intencional — é o que as restrições resolvem. */
      if (start <= base.startDate) continue;

      const moved = {
        ...base,
        startDate: start,
        endDate: endFromWorkingDuration(start, duration, calendar),
      };
      updates.set(moved.id, moved);
      queue.push(moved);
    }
  }

  return Array.from(updates.values());
}

export function useAutoScheduling(project) {
  return useCallback(
    (changedTask, allTasks) => applyForwardPass(changedTask, allTasks, project),
    [project]
  );
}

/**
 * Análise CPM completa: folga total, folga livre e caminho crítico.
 * A implementação vive em utils/cpm.js — aqui só memorizamos.
 */
export function useScheduleAnalysis(tasks, project) {
  return useMemo(
    () => analyseSchedule(tasks, calendarOf(project)),
    [tasks, project]
  );
}
