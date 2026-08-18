import { useMemo, useCallback } from 'react';
import { isManual } from '../../utils/schedule';
import { dependencyIds } from '../../utils/dependencies';
import { calendarOf } from '../../utils/calendar';
import { workingMinutesBetween } from '../../utils/worktime';
import { analyseSchedule } from '../../utils/cpm';
import { viewStart, viewEnd, viewProgress } from '../../utils/taskState';

/* ═══════════════════════════════════════════════════════════════
   Regras de cronograma do Gantt: hierarquia, auto-agendamento e
   caminho crítico. Separado do render para poder ser lido e testado
   sem atravessar JSX.
   ═══════════════════════════════════════════════════════════════ */

/* ── Acessores de exibição ─────────────────────────────────────────
   Mudaram de casa para utils/taskState.js, que precisa deles para
   derivar estágio e atraso e não pode importar de um módulo de hook.
   Reexportados aqui para os imports existentes seguirem valendo.   */

export { viewStart, viewEnd, viewProgress } from '../../utils/taskState';

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
  /* A tarefa alterada entra na rede ANTES do cálculo, senão o pass
     recalcularia a partir do valor antigo dela. */
  let found = false;
  const network = allTasks.map((t) => {
    if (t.id !== changedTask.id) return t;
    found = true;
    return changedTask;
  });
  if (!found) network.push(changedTask);

  /* Uma implementação só de agendamento, compartilhada com a análise.
     Havia duas: esta propagava a partir da tarefa alterada, seguindo
     UM vínculo de cada vez, e por isso ignorava as demais
     predecessoras da sucessora. Numa tarefa com duas predecessoras,
     mover uma calculava a data desprezando a outra.

     O erro ficava escondido atrás da trava de mão única: como nada
     voltava para trás, o resultado errado — sempre mais cedo — era
     descartado. Remover a trava sem unificar o cálculo teria
     transformado um cronograma preguiçoso num cronograma incorreto. */
  const { byId } = analyseSchedule(network, project);

  const out = [];

  for (const task of network) {
    const isChanged = task.id === changedTask.id;

    /* A tarefa alterada SEMPRE sai daqui: a edição pode não ter sido de
       data — recursos, predecessora, calendário — e mesmo assim precisa
       ser gravada.

       Mas ela não é exceção ao cálculo. Antes ela era gravada com o
       valor cru digitado enquanto as SUCESSORAS eram derivadas do valor
       que a rede deu a ela; quando os dois divergiam, porque ela também
       tem predecessora e agora pode ser puxada, a sucessora ia parar
       antes do término da predecessora. */
    const keep = () => { if (isChanged) out.push(task); };

    /* Resumo é derivado dos filhos: gravar nele seria persistir um
       valor calculado como se fosse do usuário. */
    if (task.hasChildren) { keep(); continue; }

    /* Manual fica onde o planejador fixou. A cadeia ATRAVESSA: as
       sucessoras dela são calculadas a partir dessas datas — é o que
       a análise já faz, então basta não escrever nela. */
    if (isManual(task)) { keep(); continue; }

    const node = byId.get(task.id);
    if (!node?.es || !node?.ef) { keep(); continue; }
    if (node.es === task.startDate && node.ef === task.endDate) { keep(); continue; }

    out.push({ ...task, startDate: node.es, endDate: node.ef });
  }

  return out;
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
