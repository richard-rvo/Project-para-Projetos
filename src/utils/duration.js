import { minutesPerDay } from './worktime';

/* ═══════════════════════════════════════════════════════════════
   DURAÇÃO — como o usuário escreve e lê o tempo de uma tarefa
   ═══════════════════════════════════════════════════════════════

   Havia TRÊS conversões concorrentes, e elas discordavam:

   · GanttView abria o editor com dias CORRIDOS e gravava dias ÚTEIS.
     Abrir a duração de uma tarefa seg–sex e apertar Enter sem digitar
     nada empurrava o término para a sexta seguinte.
   · O Inspetor somava dias corridos.
   · A view Tabela mostrava `durationDays` (corridos) enquanto o Gantt
     mostrava dias úteis — a mesma tarefa com dois números.

   Agora existe uma conversão só, e ela é em MINUTOS ÚTEIS do
   calendário DA TAREFA. "1 dia" não é uma quantidade de tempo: é
   `minutesPerDay(calendário)` — 8h no Padrão, 24h no 24 Horas.

   A entrada aceita a notação do MS Project: `3d`, `4h`, `90m`. Número
   solto é dia, que é o que o planejador digita 95% das vezes.
   ═══════════════════════════════════════════════════════════════ */

const MINUTES_PER_HOUR = 60;

/** Menor duração possível — abaixo disso a tarefa é um marco. */
export const MIN_MINUTES = 1;

/**
 * Minutos úteis → texto curto para a célula da grade.
 *
 * Abaixo de um dia mostra horas (ou minutos), porque `0,13d` não diz
 * nada a ninguém e `1h` diz tudo. Marco mostra `0d`, como no MS
 * Project.
 */
export function formatDuration(minutes, cal) {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total === 0) return '0d';

  const perDay = minutesPerDay(cal);

  if (total < perDay) {
    if (total % MINUTES_PER_HOUR === 0) return `${total / MINUTES_PER_HOUR}h`;
    if (total < MINUTES_PER_HOUR) return `${total}m`;
    return `${trim(total / MINUTES_PER_HOUR)}h`;
  }

  return `${trim(total / perDay)}d`;
}

/**
 * Texto do usuário → minutos úteis. Devolve null quando não dá para
 * ler, para o chamador poder manter o valor anterior em vez de
 * gravar zero.
 */
export function parseDuration(text, cal) {
  const raw = String(text ?? '').trim().toLowerCase().replace(',', '.');
  if (!raw) return null;

  const match = raw.match(/^(-?\d*\.?\d+)\s*(d|h|m|min|dias?|horas?|minutos?)?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;

  const unit = (match[2] || 'd')[0]; // d | h | m
  if (unit === 'h') return Math.round(value * MINUTES_PER_HOUR);
  if (unit === 'm') return Math.round(value);
  return Math.round(value * minutesPerDay(cal));
}

/**
 * O que gravar quando o editor de duração fecha.
 *
 * A exibição arredonda — 480 minutos num calendário de 6h/dia são
 * "1,33d" — e reler esse texto devolveria 479. Então reabrir a célula
 * e apertar Enter sem digitar nada encolhia a tarefa em um minuto, de
 * novo a cada vez.
 *
 * A regra é: se o texto continua sendo o rótulo do valor atual, o
 * usuário não mudou nada, e o valor atual permanece intacto. Só texto
 * que produz um rótulo DIFERENTE conta como edição.
 *
 * Devolve null quando não dá para ler — aí o chamador não grava.
 */
export function resolveDuration(text, cal, currentMinutes) {
  const parsed = parseDuration(text, cal);
  if (parsed === null) return null;
  if (formatDuration(parsed, cal) === formatDuration(currentMinutes, cal)) {
    return currentMinutes;
  }
  return parsed;
}

/** 1,5 → "1,5" · 3 → "3" — pt-BR, sem zero à toa. */
function trim(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}
