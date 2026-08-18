import { isManual } from './schedule';
import { calendarOf } from './calendar';
import {
  addWorkingMinutes, workingMinutesBetween, snapForward, snapBackward,
  minutesPerDay,
} from './worktime';
import { readDependencies } from './dependencies';

/* ═══════════════════════════════════════════════════════════════
   CPM — método do caminho crítico, completo
   ═══════════════════════════════════════════════════════════════

   O que existia antes desta análise era meio CPM: só um backward pass
   de late-finish, sem forward pass e sem folga. Ele marcava como
   crítica qualquer tarefa cujo término coincidisse com o fim do
   projeto — o que acerta por acaso em cronogramas simples e erra em
   qualquer um com caminhos paralelos.

   Aqui estão as duas passagens:

     forward  → ES/EF (mais cedo possível), respeitando tipo e lag
     backward → LS/LF (mais tarde possível sem atrasar o projeto)

     folga total = LS − ES   quanto a tarefa pode escorregar sem
                             empurrar o fim do projeto
     folga livre = quanto pode escorregar sem empurrar a SUCESSORA
                   mais próxima

   Crítica é folga total ≤ 0.

   Tudo é contado em MINUTOS ÚTEIS, no calendário DE CADA TAREFA.
   Contar em dias corridos mentiria sobre o fim de semana; contar em
   dias úteis de um calendário só mentiria sobre a tarefa que roda em
   turno diferente do resto do cronograma.

   Esta análise nunca é gravada. Ela alimenta o realce do caminho
   crítico, a barra fantasma de folga e o aviso de violação — o que
   grava data é o forward pass de useGanttTasks.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Início que uma dependência exige da sucessora, no calendário DELA.
 *
 * Mora aqui porque é a mesma regra usada em três lugares: o forward
 * pass que move a tarefa, o CPM que calcula o mais-cedo, e o aviso de
 * violação da tarefa manual. Três implementações da mesma regra
 * acabariam discordando — foi assim que a duração passou a ter três
 * respostas diferentes antes desta fase.
 */
export function requiredStart(link, pred, succCalendar, durationMinutes) {
  const cal = succCalendar;
  const lag = (link.lag || 0) * minutesPerDay(cal);

  let start = null;
  let finish = null;

  switch (link.type) {
    case 'SS':
      start = addWorkingMinutes(cal, snapForward(cal, pred.startDate), lag);
      break;
    case 'FF':
      finish = addWorkingMinutes(cal, snapBackward(cal, pred.endDate), lag);
      break;
    case 'SF':
      finish = addWorkingMinutes(cal, snapBackward(cal, pred.startDate), lag);
      break;
    case 'FS':
    default:
      /* O término da predecessora é o instante em que o trabalho para.
         Encaixar esse mesmo instante para frente no calendário da
         sucessora já entrega segunda 08:00 quando a predecessora
         terminou sexta 17:00 — o `+1 dia` que existia aqui era a
         gambiarra que compensava a falta de hora. */
      start = addWorkingMinutes(cal, snapForward(cal, pred.endDate), lag);
      break;
  }

  if (finish && !start) start = addWorkingMinutes(cal, finish, -durationMinutes);
  return start ? snapForward(cal, start) : null;
}

/**
 * Término mais tarde que o nó pode ter sem empurrar esta sucessora.
 * O inverso exato de requiredStart, usado pelo backward pass.
 */
function latestFinishFor(edge, succ, nodeCalendar, nodeDuration) {
  const cal = nodeCalendar;
  const lag = (edge.lag || 0) * minutesPerDay(cal);

  switch (edge.type) {
    case 'SS': {
      const latestStart = addWorkingMinutes(cal, succ.ls, -lag);
      return addWorkingMinutes(cal, latestStart, nodeDuration);
    }
    case 'FF':
      return addWorkingMinutes(cal, succ.lf, -lag);
    case 'SF': {
      const latestStart = addWorkingMinutes(cal, succ.lf, -lag);
      return addWorkingMinutes(cal, latestStart, nodeDuration);
    }
    case 'FS':
    default:
      return snapBackward(cal, addWorkingMinutes(cal, succ.ls, -lag));
  }
}

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
  const inOrder = new Set(order);
  const inCycle = tasks.map((t) => t.id).filter((id) => !inOrder.has(id));
  return { order: [...order, ...inCycle], successors, inCycle };
}

/**
 * @param {object[]} tasks    tarefas do projeto (campos crus)
 * @param {object}   project  dono da biblioteca de calendários
 * @returns {{byId: Map, criticalIds: Set, violatingIds: Set,
 *            projectStart, projectFinish, cycles: string[]}}
 */
export function analyseSchedule(tasks, project) {
  const scheduled = tasks.filter((t) => t.startDate && t.endDate);
  if (!scheduled.length) {
    return {
      byId: new Map(),
      criticalIds: new Set(),
      violatingIds: new Set(),
      projectStart: null,
      projectFinish: null,
      cycles: [],
    };
  }

  const { order, successors, inCycle } = topologicalOrder(scheduled);
  const byId = new Map();
  const source = new Map(scheduled.map((t) => [t.id, t]));
  const calOf = new Map(scheduled.map((t) => [t.id, calendarOf(project, t)]));

  scheduled.forEach((t) => {
    const cal = calOf.get(t.id);
    byId.set(t.id, {
      id: t.id,
      calendar: cal,
      duration: workingMinutesBetween(cal, t.startDate, t.endDate),
      es: t.startDate,
      ef: t.endDate,
      ls: null,
      lf: null,
      totalSlack: 0,
      totalSlackDays: 0,
      freeSlack: 0,
      freeSlackDays: 0,
      /* Quanto a data fixada de uma tarefa manual desrespeita as
         predecessoras. Zero em tudo que é automático. */
      violationMinutes: 0,
    });
  });

  /* ── Forward pass ──────────────────────────────────────────── */
  for (const id of order) {
    const node = byId.get(id);
    const task = source.get(id);
    if (!node || !task) continue;
    const cal = node.calendar;

    /* Restrição explícita do usuário tem precedência sobre o cedo
       natural da tarefa. */
    let earliest = task.constraintStart
      ? maxDate(task.startDate, task.constraintStart)
      : task.startDate;

    readDependencies(task.dependsOn).forEach((dep) => {
      const pred = byId.get(dep.id);
      if (!pred) return;
      const req = requiredStart(
        dep,
        { startDate: pred.es, endDate: pred.ef },
        cal,
        node.duration
      );
      earliest = maxDate(earliest, req);
    });

    if (isManual(task)) {
      /* Manual fica onde o planejador colocou. O que a análise faz é
         MEDIR o desrespeito, não corrigi-lo: mover a tarefa aqui
         apagaria em silêncio a decisão que ela representa. */
      node.es = task.startDate;
      node.ef = task.endDate;
      if (earliest && earliest > task.startDate) {
        node.violationMinutes = workingMinutesBetween(cal, task.startDate, earliest);
      }
      continue;
    }

    node.es = snapForward(cal, earliest);
    node.ef = addWorkingMinutes(cal, node.es, node.duration);
  }

  const projectStart = [...byId.values()].map((n) => n.es).sort()[0];
  const projectFinish = [...byId.values()].map((n) => n.ef).sort().reverse()[0];

  /* ── Backward pass ─────────────────────────────────────────── */
  for (const id of [...order].reverse()) {
    const node = byId.get(id);
    if (!node) continue;
    const cal = node.calendar;

    let latestFinish = null;
    for (const edge of successors.get(id) || []) {
      const succ = byId.get(edge.to);
      if (!succ || succ.ls === null) continue;
      latestFinish = minDate(latestFinish, latestFinishFor(edge, succ, cal, node.duration));
    }

    node.lf = latestFinish || projectFinish;
    node.ls = addWorkingMinutes(cal, node.lf, -node.duration);
  }

  /* ── Folgas ────────────────────────────────────────────────── */
  const criticalIds = new Set();
  const violatingIds = new Set();

  for (const node of byId.values()) {
    const cal = node.calendar;
    const perDay = minutesPerDay(cal);

    node.totalSlack = workingMinutesBetween(cal, node.es, node.ls);
    node.totalSlackDays = round2(node.totalSlack / perDay);

    const edges = successors.get(node.id) || [];
    if (!edges.length) {
      node.freeSlack = node.totalSlack;
    } else {
      let min = Infinity;
      for (const edge of edges) {
        const succ = byId.get(edge.to);
        if (!succ) continue;
        /* Quanto esta tarefa pode escorregar antes de empurrar a
           sucessora: a distância entre o que a ligação exige hoje e
           onde a sucessora realmente começa. */
        const req = requiredStart(
          edge,
          { startDate: node.es, endDate: node.ef },
          succ.calendar,
          succ.duration
        );
        const gap = req ? workingMinutesBetween(succ.calendar, req, succ.es) : Infinity;
        if (gap < min) min = gap;
      }
      node.freeSlack = min === Infinity ? node.totalSlack : Math.max(0, min);
    }
    node.freeSlackDays = round2(node.freeSlack / perDay);

    if (node.totalSlack <= 0) criticalIds.add(node.id);
    if (node.violationMinutes > 0) violatingIds.add(node.id);
  }

  return { byId, criticalIds, violatingIds, projectStart, projectFinish, cycles: inCycle };
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

function round2(value) {
  return Math.round(value * 100) / 100;
}
