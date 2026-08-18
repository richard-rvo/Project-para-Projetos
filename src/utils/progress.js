/* ═══════════════════════════════════════════════════════════════
   PROGRESS — realizado, planejado e saúde do projeto
   ═══════════════════════════════════════════════════════════════

   Toda aritmética de data vem de schedule.js. Este módulo só sabe
   ponderar progresso.

   ── O que mudou, e por quê ────────────────────────────────────────

   "Planejado" tinha DUAS definições incompatíveis convivendo no app:

   · por LINHA DE BASE, em calculateTaskPlannedProgress
   · pelo CRONOGRAMA ATUAL, aqui e em scurve.js

   A segunda é um espelho, não uma medida: as datas atuais são
   justamente as que o auto-agendamento empurra quando algo atrasa.
   O planejado perseguia o realizado, e o desvio voltava para perto de
   zero exatamente quando o projeto derrapava. A saúde — Boa, Atenção,
   Crítica — que aparece em todo card do Portfólio e no relatório
   executivo saía desse cálculo.

   Agora existe uma definição só, a que gerenciamento de projeto usa:
   planejado é a LINHA DE BASE. Sem baseline não há planejado, e o app
   diz isso em vez de inventar um número.
   ═══════════════════════════════════════════════════════════════ */

import { dateOf, durationDays, today } from './schedule';
import { viewProgress, leaves } from './taskState';

/**
 * Quanto a tarefa DEVERIA estar concluída hoje, segundo sua linha
 * de base. Sem baseline não há planejado — retorna 0.
 */
export function calculateTaskPlannedProgress(baselineStart, baselineEnd) {
  if (!baselineStart || !baselineEnd) return 0;

  /* `today()` é uma data-só; a baseline é um instante. Comparar as
     duas cruas erraria o dia de início e o de término por um dia. */
  const todayStr = today();
  if (todayStr < dateOf(baselineStart)) return 0;
  if (todayStr > dateOf(baselineEnd)) return 100;

  const totalDays = durationDays(baselineStart, baselineEnd);
  if (totalDays <= 0) return 0;

  const elapsed = durationDays(baselineStart, todayStr);
  return Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
}

/** A tarefa tem linha de base gravada nas duas pontas? */
export function hasBaseline(task) {
  return Boolean(task?.baselineStart && task?.baselineEnd);
}

/**
 * Métricas agregadas do projeto.
 *
 * `progress` (realizado) é ponderado pela duração ATUAL e existe
 * sempre — é uma medida do trabalho feito, independente de haver
 * plano contra o que comparar.
 *
 * `planned`, `deviation` e `health` só existem quando há linha de
 * base, e são calculados SÓ sobre as tarefas que a têm, ponderados
 * pela duração da baseline — o orçamento de prazo de cada tarefa, na
 * lógica de valor agregado. Sem baseline vêm `null` / 'Sem base',
 * para a tela poder pedir a linha de base em vez de exibir um desvio
 * que não significa nada.
 *
 * `earned` é o valor agregado — o realizado ponderado pelo MESMO
 * orçamento que o planejado usa. É ele, e não `progress`, que deve
 * aparecer ao lado de `planned`: comparar dois números com bases de
 * ponderação diferentes é como a Curva S e a Visão Geral passaram a
 * discordar em um ponto percentual.
 *
 * @returns {{progress:number, earned:number|null, planned:number|null,
 *            deviation:number|null, health:string, hasBaseline:boolean,
 *            baselineCoverage:number}}
 */
export function calculateProjectMetrics(projectTasks) {
  /* Só folhas: a tarefa-resumo é a soma dos filhos, então ponderar as
     duas juntas conta o mesmo trabalho duas vezes. */
  const tasks = leaves(projectTasks);
  if (tasks.length === 0) {
    return {
      progress: 0,
      earned: null,
      planned: null,
      deviation: null,
      health: 'Sem base',
      hasBaseline: false,
      baselineCoverage: 0,
    };
  }

  /* ── Realizado: sempre disponível ──────────────────────────── */
  let actualWeight = 0;
  let earned = 0;
  tasks.forEach((t) => {
    const dur = Math.max(1, durationDays(t.startDate, t.endDate));
    actualWeight += dur;
    earned += dur * viewProgress(t);
  });
  const progress = actualWeight > 0 ? Math.round(earned / actualWeight) : 0;

  /* ── Planejado: só com linha de base ───────────────────────── */
  const based = tasks.filter(hasBaseline);
  const baselineCoverage = Math.round((based.length / tasks.length) * 100);

  if (based.length === 0) {
    return {
      progress,
      earned: null,
      planned: null,
      deviation: null,
      health: 'Sem base',
      hasBaseline: false,
      baselineCoverage: 0,
    };
  }

  let budget = 0;
  let plannedValue = 0;
  let earnedValue = 0;

  based.forEach((t) => {
    /* Orçamento de prazo da tarefa: a duração que o plano previu. */
    const dur = Math.max(1, durationDays(t.baselineStart, t.baselineEnd));
    budget += dur;
    plannedValue += dur * calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd);
    earnedValue += dur * viewProgress(t);
  });

  const planned = budget > 0 ? Math.round(plannedValue / budget) : 0;
  const earnedPct = budget > 0 ? Math.round(earnedValue / budget) : 0;
  const deviation = earnedPct - planned;

  let health = 'Boa';
  if (deviation < -15) health = 'Crítica';
  else if (deviation < -5) health = 'Atenção';

  return {
    progress, earned: earnedPct, planned, deviation,
    health, hasBaseline: true, baselineCoverage,
  };
}
