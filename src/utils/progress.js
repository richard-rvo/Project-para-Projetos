/* ═══════════════════════════════════════════════════════════════
   PROGRESS — progresso planejado, realizado e saúde do projeto
   ═══════════════════════════════════════════════════════════════

   Toda aritmética de data vem de schedule.js. Este módulo só sabe
   ponderar progresso.
   ═══════════════════════════════════════════════════════════════ */

import { durationDays, today } from './schedule';

/**
 * Quanto a tarefa DEVERIA estar concluída hoje, segundo sua linha
 * de base. Sem baseline não há planejado — retorna 0.
 */
export function calculateTaskPlannedProgress(baselineStart, baselineEnd) {
  if (!baselineStart || !baselineEnd) return 0;

  const todayStr = today();
  if (todayStr < baselineStart) return 0;
  if (todayStr > baselineEnd) return 100;

  const totalDays = durationDays(baselineStart, baselineEnd);
  if (totalDays <= 0) return 0;

  const elapsed = durationDays(baselineStart, todayStr);
  return Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
}

/**
 * Métricas agregadas do projeto, ponderadas por duração: uma tarefa
 * de 30 dias pesa 30× mais que uma de 1 dia.
 *
 * A duração usada aqui é a INCLUSIVA de schedule.durationDays — a
 * mesma que o Gantt desenha. Até a Fase 0 este módulo usava a
 * exclusiva, então a Curva S e a saúde do projeto discordavam do
 * cronograma que o usuário via na tela.
 *
 * @returns {{progress:number, planned:number, deviation:number, health:string}}
 */
export function calculateProjectMetrics(projectTasks) {
  if (!projectTasks || projectTasks.length === 0) {
    return { progress: 0, planned: 0, deviation: 0, health: 'N/A' };
  }

  const todayStr = today();

  let totalDuration = 0;
  let earnedProgress = 0;
  let plannedProgressSum = 0;

  projectTasks.forEach((t) => {
    const dur = Math.max(1, durationDays(t.startDate, t.endDate));
    totalDuration += dur;

    /* Realizado: duração × progresso informado */
    earnedProgress += dur * (t.progress || 0);

    /* Planejado: fração do prazo já decorrida até hoje */
    if (!t.startDate) return;

    if (!t.endDate) {
      if (t.startDate <= todayStr) plannedProgressSum += dur * 100;
      return;
    }

    const elapsed = durationDays(t.startDate, todayStr);
    if (elapsed <= 0) return; // ainda não começou
    if (elapsed >= dur) {
      plannedProgressSum += dur * 100;
    } else {
      plannedProgressSum += dur * (elapsed / dur) * 100;
    }
  });

  const progress =
    totalDuration > 0 ? Math.round(earnedProgress / totalDuration) : 0;
  const planned =
    totalDuration > 0 ? Math.round(plannedProgressSum / totalDuration) : 0;
  const deviation = progress - planned;

  let health = 'N/A';
  if (deviation >= -5) health = 'Boa';
  else if (deviation >= -15) health = 'Atenção';
  else health = 'Crítica';

  return { progress, planned, deviation, health };
}
