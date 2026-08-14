/* ═══════════════════════════════════════════════════════════════
   SCHEDULE — fonte única de verdade de datas e duração
   ═══════════════════════════════════════════════════════════════

   Antes desta fase havia duas implementações concorrentes:

   · PageGantt.durationDays()  →  daysBetween(a, b) + 1   (inclusiva)
   · progress.js               →  daysBetween(a, b)       (exclusiva)

   A mesma tarefa tinha durações diferentes conforme a tela, o que
   desalinhava a ponderação da Curva S e a saúde do projeto em
   relação ao que o Gantt desenhava.

   A INCLUSIVA é a correta: uma tarefa de segunda a sexta dura
   5 dias, não 4. Este módulo fixa essa definição para todo o app.

   Toda aritmética de calendário roda em UTC. Datas são sempre
   strings 'YYYY-MM-DD' — nunca objetos Date atravessando fronteira
   de módulo, para não arrastar fuso horário junto.
   ═══════════════════════════════════════════════════════════════ */

const MS_PER_DAY = 86400000;

/* ── Conversão ─────────────────────────────────────────────────── */

/** 'YYYY-MM-DD' → Date na meia-noite UTC. */
export function parseISO(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → 'YYYY-MM-DD'. */
export function toISO(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Hoje como 'YYYY-MM-DD', no calendário local do usuário. */
export function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/* ── Aritmética ────────────────────────────────────────────────── */

/**
 * Dias corridos de `a` até `b`, com sinal. Exclusiva por definição:
 * daysBetween('2026-01-01', '2026-01-02') === 1.
 * Use durationDays() quando quiser a duração de uma tarefa.
 */
export function daysBetween(a, b) {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

/** Desloca uma data em N dias corridos (N pode ser negativo). */
export function addDays(dateStr, days) {
  const d = parseISO(dateStr);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/**
 * Duração de uma tarefa em dias corridos, INCLUINDO início e término.
 * Uma tarefa que começa e termina no mesmo dia (marco) dura 1.
 * Retorna 0 quando falta alguma das pontas.
 */
export function durationDays(start, end) {
  if (!start || !end) return 0;
  return daysBetween(start, end) + 1;
}

/** Data de término a partir do início e da duração inclusiva. */
export function endDateFrom(start, duration) {
  if (!start) return '';
  return addDays(start, Math.max(1, Math.round(duration)) - 1);
}

/** Uma tarefa é marco quando começa e termina no mesmo dia. */
export function isMilestone(task) {
  return Boolean(task?.startDate) && task.startDate === task.endDate;
}

/* ── Calendário ────────────────────────────────────────────────── */

/** Dia da semana em UTC: 0 = domingo … 6 = sábado. */
export function dayOfWeek(dateStr) {
  const d = parseISO(dateStr);
  return d ? d.getUTCDay() : 0;
}

export function isWeekend(dateStr) {
  const dow = dayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

/* ── Formatação (pt-BR) ────────────────────────────────────────────
   Exibição usa meio-dia LOCAL de propósito: às 00:00 UTC um fuso
   negativo renderiza o dia anterior.                               */

function parseForDisplay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 13/08/26 */
export function formatDateShort(dateStr) {
  const d = parseForDisplay(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** 13 de ago. de 2026 */
export function formatDateLong(dateStr) {
  const d = parseForDisplay(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Agosto de 2026 — cabeçalho de mês da timeline. Só a inicial sobe:
 *  text-transform capitalize produzia 'Agosto De 2026'. */
export function getMonthLabel(dateStr) {
  const d = parseForDisplay(dateStr);
  if (!d) return '';
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** ago/26 — para faixas estreitas, onde o nome inteiro seria cortado. */
export function getMonthLabelShort(dateStr) {
  const d = parseForDisplay(dateStr);
  if (!d) return '';
  const m = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return m + '/' + String(d.getFullYear()).slice(2);
}

const DAY_CHARS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Inicial do dia da semana — cabeçalho de dia da timeline. */
export function getDayOfWeekChar(dateStr) {
  return DAY_CHARS[dayOfWeek(dateStr)];
}

/* ── Utilidades ────────────────────────────────────────────────── */

/** Garante progresso inteiro dentro de 0–100. */
export function clampProgress(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
