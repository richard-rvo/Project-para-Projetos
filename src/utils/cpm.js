import { addDays, daysBetween } from './schedule';
import {
  DEFAULT_CALENDAR, nextWorkingDay, previousWorkingDay,
  workingDuration, endFromWorkingDuration, shiftWorkingDays,
} from './calendar';
import { readDependencies } from './dependencies';

/* ═══════════════════════════════════════════════════════════════
   CPM — método do caminho crítico, completo
   ═══════════════════════════════════════════════════════════════

   O que existia antes era meio CPM: só um backward pass de
   late-finish, sem forward pass e sem folga. Ele marcava como crítica
   qualquer tarefa cujo término coincidisse com o fim do projeto —
   o que acerta por acaso em cronogramas simples e erra em qualquer
   um com caminhos paralelos.

   Aqui estão as duas passagens:

     forward  → ES/EF (mais cedo possível), respeitando tipo e lag
     backward → LS/LF (mais tarde possível sem atrasar o projeto)

     folga total = LS − ES   quanto a tarefa pode escorregar sem
                             empurrar o fim do projeto
     folga livre = quanto pode escorregar sem empurrar a SUCESSORA
                   mais próxima

   Crítica é folga total ≤ 0. Tudo em dias úteis do calendário do
   projeto — folga em dias corridos mentiria sobre fim de semana.
   ═══════════════════════════════════════════════════════════════ */

/** Ordem topológica; devolve também os nós presos em ciclo. */
function topologicalOrder(tasks) {
  const indegree = new Map(tasks.map((t) => [t.id, 0]));
  const successors = new Map(tasks.map((t) => [t.id, []]));

  tasks.forEach((task) => {
    readDependencies(task.dependsOn).forEach((dep) => {
      if (!indegree.has(dep.id)) return; // predecessora de outro projeto
      indegree.set(task.id, indegree.get(task.id) + 1);
      successors.get(dep.id).push({ to: task.id, type: dep.type, lag: dep.lag });
    });
  });

  const queue = tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    successors.get(id).forEach((edge) => {
      const next = indegree.get(edge.to) - 1;
      indegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    });
  }

  /* Sobrou nó = ciclo. Anexamos ao fim para o cálculo não travar,
     e devolvemos a lista para a UI poder avisar. */
  const inCycle = tasks.map((t) => t.id).filter((id) => !order.includes(id));
  return { order: [...order, ...inCycle], successors, inCycle };
}

/**
 * @param {object[]} tasks     tarefas do projeto (campos crus)
 * @param {object}   calendar  calendário de trabalho
 * @returns {{byId: Map, criticalIds: Set, projectStart, projectFinish, cycles: string[]}}
 */
export function analyseSchedule(tasks, calendar = DEFAULT_CALENDAR) {
  const scheduled = tasks.filter((t) => t.startDate && t.endDate);
  if (!scheduled.length) {
    return { byId: new Map(), criticalIds: new Set(), projectStart: null, projectFinish: null, cycles: [] };
  }

  const { order, successors, inCycle } = topologicalOrder(scheduled);
  const byId = new Map();
  const source = new Map(scheduled.map((t) => [t.id, t]));

  scheduled.forEach((t) => {
    byId.set(t.id, {
      id: t.id,
      duration: workingDuration(t.startDate, t.endDate, calendar),
      es: t.startDate,
      ef: t.endDate,
      ls: null,
      lf: null,
      totalSlack: 0,
      freeSlack: 0,
    });
  });

  /* ── Forward pass ──────────────────────────────────────────── */
  for (const id of order) {
    const node = byId.get(id);
    const task = source.get(id);
    if (!node || !task) continue;

    /* Restrição explícita do usuário tem precedência sobre o cedo
       natural da tarefa. */
    let earliestStart = task.constraintStart
      ? maxDate(task.startDate, task.constraintStart)
      : task.startDate;
    let earliestFinish = null;

    readDependencies(task.dependsOn).forEach((dep) => {
      const pred = byId.get(dep.id);
      if (!pred) return;
      const lag = dep.lag || 0;

      switch (dep.type) {
        case 'SS':
          earliestStart = maxDate(earliestStart, shiftWorkingDays(pred.es, lag, calendar));
          break;
        case 'FF':
          earliestFinish = maxDate(earliestFinish, shiftWorkingDays(pred.ef, lag, calendar));
          break;
        case 'SF':
          earliestFinish = maxDate(earliestFinish, shiftWorkingDays(pred.es, lag, calendar));
          break;
        case 'FS':
        default:
          /* +1 porque o término é inclusivo: terminar na sexta libera
             a sucessora para a segunda, não para a própria sexta. */
          earliestStart = maxDate(
            earliestStart,
            shiftWorkingDays(nextWorkingDay(addDays(pred.ef, 1), calendar), lag, calendar)
          );
          break;
      }
    });

    if (earliestFinish) {
      /* FF/SF fixam o término: o início decorre da duração. */
      const backStart = shiftWorkingDays(earliestFinish, -(node.duration - 1), calendar);
      earliestStart = maxDate(earliestStart, backStart);
    }

    node.es = nextWorkingDay(earliestStart, calendar);
    node.ef = endFromWorkingDuration(node.es, node.duration, calendar);
  }

  const projectStart = [...byId.values()].map((n) => n.es).sort()[0];
  const projectFinish = [...byId.values()].map((n) => n.ef).sort().reverse()[0];

  /* ── Backward pass ─────────────────────────────────────────── */
  for (const id of [...order].reverse()) {
    const node = byId.get(id);
    if (!node) continue;

    const edges = successors.get(id) || [];
    let latestFinish = null;

    edges.forEach((edge) => {
      const succ = byId.get(edge.to);
      if (!succ || succ.ls === null) return;
      const lag = edge.lag || 0;

      switch (edge.type) {
        case 'SS':
          latestFinish = minDate(
            latestFinish,
            endFromWorkingDuration(shiftWorkingDays(succ.ls, -lag, calendar), node.duration, calendar)
          );
          break;
        case 'FF':
          latestFinish = minDate(latestFinish, shiftWorkingDays(succ.lf, -lag, calendar));
          break;
        case 'SF':
          latestFinish = minDate(
            latestFinish,
            endFromWorkingDuration(shiftWorkingDays(succ.lf, -lag, calendar), node.duration, calendar)
          );
          break;
        case 'FS':
        default:
          latestFinish = minDate(
            latestFinish,
            previousWorkingDay(addDays(shiftWorkingDays(succ.ls, -lag, calendar), -1), calendar)
          );
          break;
      }
    });

    node.lf = latestFinish || projectFinish;
    node.ls = shiftWorkingDays(node.lf, -(node.duration - 1), calendar);
  }

  /* ── Folgas ────────────────────────────────────────────────── */
  const criticalIds = new Set();

  for (const node of byId.values()) {
    node.totalSlack = workingDaysDelta(node.es, node.ls, calendar);

    const edges = successors.get(node.id) || [];
    if (!edges.length) {
      node.freeSlack = node.totalSlack;
    } else {
      let min = Infinity;
      edges.forEach((edge) => {
        const succ = byId.get(edge.to);
        if (!succ) return;
        const gap = workingDaysDelta(addDays(node.ef, 1), succ.es, calendar) - (edge.lag || 0);
        if (gap < min) min = gap;
      });
      node.freeSlack = min === Infinity ? node.totalSlack : Math.max(0, min);
    }

    if (node.totalSlack <= 0) criticalIds.add(node.id);
  }

  return { byId, criticalIds, projectStart, projectFinish, cycles: inCycle };
}

/* ── Auxiliares ────────────────────────────────────────────────── */

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** Dias úteis de `from` até `to`, com sinal. */
function workingDaysDelta(from, to, calendar) {
  if (!from || !to) return 0;
  const raw = daysBetween(from, to);
  if (raw === 0) return 0;
  const span = workingDuration(
    raw > 0 ? from : to,
    raw > 0 ? to : from,
    calendar
  ) - 1;
  return raw > 0 ? span : -span;
}
