import { useMemo, useCallback } from 'react';
import { addDays, daysBetween, durationDays, today } from '../../utils/schedule';

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
      const currentEnd = viewEnd(current);
      if (!currentEnd) continue;

      for (const succId of successors.get(current.id) || []) {
        const base = allTasks.find((t) => t.id === succId);
        if (!base) continue;

        const succ = updates.get(succId) || { ...base };
        if (!succ.startDate) continue;

        /* Resumo tem datas derivadas dos filhos: empurrá-lo seria
           gravar valor calculado como se fosse do usuário. */
        if (succ.hasChildren) continue;

        const earliestStart = addDays(currentEnd, 1);
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
      .map((t) => viewEnd(t))
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
          const dur = Math.max(1, durationDays(viewStart(succ), viewEnd(succ)));
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
      const end = viewEnd(t);
      if (!end) return;
      const slack = daysBetween(end, getLateFinish(t.id));
      if (slack <= 0) critical.add(t.id);
    });
    return critical;
  }, [tasks, enabled]);
}
