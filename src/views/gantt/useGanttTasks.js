import { useMemo, useCallback } from 'react';
import { addDays, daysBetween, durationDays, today } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Regras de cronograma do Gantt: hierarquia, auto-agendamento e
   caminho crítico. Separado do render para poder ser lido e testado
   sem atravessar JSX.
   ═══════════════════════════════════════════════════════════════ */

/** Lista de predecessoras a partir do campo (hoje CSV de ids). */
export function parseDependencies(dependsOn) {
  if (!dependsOn) return [];
  return String(dependsOn)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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

      const starts = children.map((c) => c.startDate).filter(Boolean).sort();
      const ends = children.map((c) => c.endDate).filter(Boolean).sort();
      if (starts.length) task.startDate = starts[0];
      if (ends.length) task.endDate = ends[ends.length - 1];

      let totalDur = 0;
      let earned = 0;
      children.forEach((c) => {
        const d = durationDays(c.startDate, c.endDate) || 1;
        totalDur += d;
        earned += d * (c.progress || 0);
      });
      task.progress = totalDur > 0 ? Math.round(earned / totalDur) : 0;
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
    parseDependencies(t.dependsOn).forEach((depId) => {
      if (!map.has(depId)) map.set(depId, []);
      map.get(depId).push(t.id);
    });
  });
  return map;
}

/**
 * Forward pass: mover uma tarefa empurra as sucessoras que passariam
 * a começar antes do término da predecessora.
 *
 * Só empurra para frente — nunca puxa de volta. Puxar exigiria saber
 * se a folga é intencional, o que só a Onda C (com constraints)
 * conseguirá responder.
 */
export function useAutoScheduling() {
  return useCallback((changedTask, allTasks) => {
    const updates = new Map([[changedTask.id, changedTask]]);
    const successors = buildSuccessorMap(allTasks);
    const queue = [changedTask];
    const visited = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      if (!current.endDate) continue;

      for (const succId of successors.get(current.id) || []) {
        const base = allTasks.find((t) => t.id === succId);
        if (!base) continue;

        const succ = updates.get(succId) || { ...base };
        if (!succ.startDate) continue;

        const earliestStart = addDays(current.endDate, 1);
        if (succ.startDate >= earliestStart) continue;

        const dur = durationDays(succ.startDate, succ.endDate);
        succ.startDate = earliestStart;
        succ.endDate = addDays(earliestStart, Math.max(1, dur) - 1);

        updates.set(succ.id, succ);
        queue.push(succ);
      }
    }

    return Array.from(updates.values());
  }, []);
}

/**
 * Caminho crítico.
 *
 * Backward pass de late-finish: uma tarefa é crítica quando seu
 * término mais tarde possível coincide com o término planejado, ou
 * seja, folga zero.
 *
 * Nota: ainda é meio CPM. O forward pass real com folga total e livre
 * chega na Onda C, junto com o calendário de trabalho.
 */
export function useCriticalPath(tasks, enabled) {
  return useMemo(() => {
    if (!enabled || !tasks.length) return new Set();

    const successors = buildSuccessorMap(tasks);
    const byId = new Map(tasks.map((t) => [t.id, t]));

    const finishes = tasks
      .map((t) => t.endDate)
      .filter(Boolean)
      .sort();
    const projectEnd = finishes[finishes.length - 1] || today();

    const lateFinish = new Map();
    const visiting = new Set();

    const getLateFinish = (taskId) => {
      if (lateFinish.has(taskId)) return lateFinish.get(taskId);
      /* Dependência circular: corta no fim do projeto em vez de estourar */
      if (visiting.has(taskId)) return projectEnd;

      visiting.add(taskId);
      const succs = successors.get(taskId) || [];

      let result = projectEnd;
      if (succs.length) {
        let earliest = null;
        for (const succId of succs) {
          const succ = byId.get(succId);
          if (!succ) continue;
          const succLF = getLateFinish(succId);
          const dur = Math.max(1, durationDays(succ.startDate, succ.endDate));
          /* Late start da sucessora = LF − duração + 1; o predecessor
             precisa terminar um dia antes disso. */
          const succLateStart = addDays(succLF, -(dur - 1));
          const mustFinishBy = addDays(succLateStart, -1);
          if (earliest === null || mustFinishBy < earliest) earliest = mustFinishBy;
        }
        if (earliest !== null) result = earliest;
      }

      visiting.delete(taskId);
      lateFinish.set(taskId, result);
      return result;
    };

    const critical = new Set();
    tasks.forEach((t) => {
      if (!t.endDate) return;
      const slack = daysBetween(t.endDate, getLateFinish(t.id));
      if (slack <= 0) critical.add(t.id);
    });
    return critical;
  }, [tasks, enabled]);
}
