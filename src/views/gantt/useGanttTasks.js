import { useMemo, useCallback } from 'react';
import { isManual } from '../../utils/schedule';
import { dependencyIds, readDependencies } from '../../utils/dependencies';
import { calendarOf } from '../../utils/calendar';
import { addWorkingMinutes, workingMinutesBetween, snapForward } from '../../utils/worktime';
import { analyseSchedule, requiredStart } from '../../utils/cpm';

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
 * Peso de um filho no progresso do resumo, na regra do MS Project:
 *
 *     %Concluída do resumo = Σ(Duração Real) / Σ(Duração)
 *     Duração Real = Duração × %Concluída
 *
 * A estrutura sempre foi essa; o que estava errado era a DURAÇÃO.
 * Ela era contada em dias corridos, e no MS Project duração é sempre
 * tempo útil no calendário DA TAREFA. Um filho que atravessava o fim
 * de semana pesava o dobro de outro com o mesmo trabalho: sex→seg
 * contava 4, ter→qua contava 2, e o resumo mostrava 33% onde o certo
 * era 50%.
 *
 * Marco pesa ZERO, como no MS Project: duração zero não entra nem no
 * numerador nem no denominador, então concluir um marco não move a
 * porcentagem do pai. Antes pesava 1, porque `durationDays` é
 * inclusiva e devolve 1 para início e término no mesmo dia.
 */
function progressWeight(child, project) {
  return workingMinutesBetween(
    calendarOf(project, child),
    viewStart(child),
    viewEnd(child)
  );
}

/**
 * Tarefas do projeto, ordenadas, com resumo calculado de baixo para
 * cima: uma tarefa com filhos herda o menor início, o maior término e
 * o progresso ponderado por duração útil.
 *
 * `project` entra porque o peso depende do calendário de cada filho —
 * numa cadeia com turno de campo 24h e equipe administrativa 8h/dia,
 * "um dia" de cada um é trabalho bem diferente.
 *
 * Também marca `hasChildren` e `depth` para o render da hierarquia.
 *
 * Função pura, exportada à parte do hook: o rollup é a regra de
 * negócio mais fácil de quebrar em silêncio deste arquivo, e assim ela
 * pode ser testada sem montar React.
 */
export function buildProjectTasks(allTasks, projectId, collapsedIds, project) {
  {
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
        const d = progressWeight(c, project);
        totalDur += d;
        earned += d * viewProgress(c);
      });

      /* Só marcos por baixo: a soma dos pesos é zero e a ponderação
         não existe. A média simples é a única resposta que não é NaN,
         e trata os marcos como igualmente importantes — que é o que
         eles são quando não há mais nada para comparar. */
      const progress = totalDur > 0
        ? Math.round(earned / totalDur)
        : Math.round(
          children.reduce((sum, c) => sum + viewProgress(c), 0) / children.length
        );

      task.rollup = {
        startDate: starts[0] || task.startDate,
        endDate: ends[ends.length - 1] || task.endDate,
        progress,
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
  }
}

export function useProjectTasks(allTasks, projectId, collapsedIds, project) {
  return useMemo(
    () => buildProjectTasks(allTasks, projectId, collapsedIds, project),
    [allTasks, projectId, collapsedIds, project]
  );
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
 * defasagem, MODO da tarefa e o calendário DE CADA TAREFA.
 *
 * O calendário é resolvido por tarefa dentro do laço, e não uma vez
 * por projeto: com calendários diferentes na mesma cadeia — turno de
 * campo 24h alimentando uma revisão administrativa de 8h/dia — usar o
 * calendário do projeto para as duas dá uma data que nenhuma das duas
 * equipes consegue cumprir.
 */
export function applyForwardPass(changedTask, allTasks, project) {
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

      /* Tarefa manual não se move — mas a cadeia ATRAVESSA ela: as
         sucessoras dela continuam sendo calculadas a partir das datas
         que o planejador fixou. Parar aqui deixaria metade do
         cronograma sem recalcular. */
      if (isManual(base)) {
        queue.push(base);
        continue;
      }

      const cal = calendarOf(project, base);
      const pred = current(task.id);
      const duration = workingMinutesBetween(cal, base.startDate, base.endDate);

      let start = requiredStart(link, pred, cal, duration);
      if (!start) continue;

      if (base.constraintStart && start < base.constraintStart) {
        start = snapForward(cal, base.constraintStart);
      }

      /* Só empurra para frente. Puxar de volta exigiria saber se a
         folga é intencional — é o que o modo manual resolve. */
      if (start <= base.startDate) continue;

      const moved = {
        ...base,
        startDate: start,
        endDate: addWorkingMinutes(cal, start, duration),
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
  return useMemo(() => analyseSchedule(tasks, project), [tasks, project]);
}
