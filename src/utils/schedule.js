/* ═══════════════════════════════════════════════════════════════
   SCHEDULE — fonte única de verdade de datas, instantes e duração
   ═══════════════════════════════════════════════════════════════

   Antes desta fase havia duas implementações concorrentes:

   · PageGantt.durationDays()  →  daysBetween(a, b) + 1   (inclusiva)
   · progress.js               →  daysBetween(a, b)       (exclusiva)

   A mesma tarefa tinha durações diferentes conforme a tela, o que
   desalinhava a ponderação da Curva S e a saúde do projeto em
   relação ao que o Gantt desenhava.

   A INCLUSIVA é a correta: uma tarefa de segunda a sexta dura
   5 dias, não 4. Este módulo fixa essa definição para todo o app.

   ── Instante ──────────────────────────────────────────────────────

   Uma tarefa agora tem HORA, e o valor guardado é
   'YYYY-MM-DDTHH:mm' — local-ingênuo: sem 'Z' e sem offset.

   A invariante que sempre protegeu este app continua de pé, e é o
   motivo de a hora ter entrado como sufixo em vez de virar Date:
   data é string ORDENÁVEL, então todo `a < b`, todo `.sort()` e todo
   `maxDate/minDate` do código seguem corretos sem revisão; e nenhum
   objeto Date atravessa fronteira de módulo, então fuso horário não
   viaja junto com o dado.

   Valor legado de data-só continua funcionando: 'YYYY-MM-DD' compara
   como se fosse meia-noite daquele dia, que é exatamente o que ele
   significava antes.

   O TÉRMINO não mudou de sentido: é o instante em que o trabalho
   para, e a parte-data dele continua sendo o último dia inclusivo.
   Segunda a sexta é '…-10T08:00' → '…-14T17:00', e `dateOf(término)`
   ainda é o dia 14 — por isso toda a geometria por dia e toda a
   formatação anterior sobrevivem.

   A aritmética de dia roda em UTC. A de tempo útil mora em
   utils/worktime.js, que é quem conhece turnos e feriados.
   ═══════════════════════════════════════════════════════════════ */

const MS_PER_DAY = 86400000;

/* ── Partes de um instante ─────────────────────────────────────── */

/** Parte-data de um instante ou de uma data-só. */
export function dateOf(value) {
  return value ? String(value).slice(0, 10) : '';
}

/** Parte-hora 'HH:mm'. Data-só devolve '00:00'. */
export function timeOf(value) {
  const s = String(value || '');
  return s.length >= 16 ? s.slice(11, 16) : '00:00';
}

/** 'YYYY-MM-DD' + 'HH:mm' → instante. */
export function joinDateTime(date, time) {
  if (!date) return '';
  return `${dateOf(date)}T${time || '00:00'}`;
}

/** O valor carrega hora, ou é uma data-só legada? */
export function hasTime(value) {
  return String(value || '').length >= 16;
}

/* ── Conversão ─────────────────────────────────────────────────── */

/** Data ou instante → Date na meia-noite UTC do DIA. */
export function parseISO(value) {
  if (!value) return null;
  const d = new Date(`${dateOf(value)}T00:00:00Z`);
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

/** Agora como instante 'YYYY-MM-DDTHH:mm', no relógio local. */
export function now() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/* ── Aritmética ────────────────────────────────────────────────── */

/**
 * Dias corridos de `a` até `b`, com sinal, contados de DIA para dia:
 * a hora é ignorada. Exclusiva por definição —
 * daysBetween('2026-01-01', '2026-01-02') === 1.
 * Use durationDays() quando quiser a duração de uma tarefa.
 */
export function daysBetween(a, b) {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

/** Desloca N dias corridos (N pode ser negativo), PRESERVANDO a hora. */
export function addDays(value, days) {
  const d = parseISO(value);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return hasTime(value) ? joinDateTime(toISO(d), timeOf(value)) : toISO(d);
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

/**
 * Marco é a tarefa de duração zero: começa e termina no MESMO
 * instante. Antes de existir hora isso era "no mesmo dia", e a
 * migração para instantes preserva a igualdade justamente para os
 * marcos antigos não virarem tarefas de um dia.
 */
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
   negativo renderiza o dia anterior. A hora do instante não entra
   aqui — ela é formatada à parte, para o meio-dia continuar sendo o
   truque de fuso que sempre foi.                                   */

function parseForDisplay(value) {
  if (!value) return null;
  const d = new Date(`${dateOf(value)}T12:00:00`);
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

/** 08:00 — só a hora. Vazio quando o valor é data-só legada. */
export function formatTime(value) {
  return hasTime(value) ? timeOf(value) : '';
}

/** 13/08/26 08:00 — a forma das colunas Início e Término. */
export function formatDateTimeShort(value) {
  const date = formatDateShort(value);
  if (!date) return '';
  const time = formatTime(value);
  return time ? `${date} ${time}` : date;
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

/* ── Modo de agendamento ───────────────────────────────────────────
   Como no MS Project: uma tarefa é calculada pelas predecessoras
   (automática) ou fixada pelo planejador (manual).

   Ausente significa AUTOMÁTICA — é o que todo cronograma anterior a
   este campo era, então nenhum dado precisou migrar.

   Manual não é "sem dependência": as setas continuam lá e a tarefa
   continua empurrando as sucessoras dela. O que ela não faz é se
   mover sozinha. Quando a data fixada desrespeita a predecessora, o
   Gantt avisa — e não corrige, porque corrigir seria desfazer a
   decisão que o planejador tomou de propósito.                     */

export const SCHEDULE_MODES = {
  AUTO: 'auto',
  MANUAL: 'manual',
};

export function isManual(task) {
  return task?.scheduleMode === SCHEDULE_MODES.MANUAL;
}

export function scheduleModeOf(task) {
  return isManual(task) ? SCHEDULE_MODES.MANUAL : SCHEDULE_MODES.AUTO;
}

/* ── Restrições de data ────────────────────────────────────────────
   As constraints do MS Project. Antes existia um campo
   `constraintStart` LIDO em dois lugares — no CPM e no forward pass —
   e escrito em nenhum: não havia UI para defini-lo. O planejador que
   precisasse prender uma data só tinha o modo manual, que é caro,
   porque tira a tarefa do agendamento automático inteiro.

   As três primeiras movem a tarefa. FNLT não move: é um PRAZO, e
   estourá-lo vira aviso — mexer nas datas para caber num prazo seria
   inventar um plano que ninguém decidiu.                            */

export const CONSTRAINT_TYPES = [
  {
    id: 'none',
    label: 'O mais breve possível',
    hint: 'Segue as predecessoras, sem data fixa',
    needsDate: false,
  },
  {
    id: 'snet',
    label: 'Não iniciar antes de',
    hint: 'Piso: a tarefa pode atrasar, mas não pode adiantar além desta data',
    needsDate: true,
  },
  {
    id: 'mso',
    label: 'Deve iniciar em',
    hint: 'Data fixa, mesmo que a predecessora permita outra',
    needsDate: true,
  },
  {
    id: 'fnlt',
    label: 'Não terminar depois de',
    hint: 'Prazo: não move a tarefa, mas avisa quando é estourado',
    needsDate: true,
  },
];

export const CONSTRAINT_NONE = 'none';

export function constraintOf(task) {
  const type = task?.constraintType;
  if (!type || type === CONSTRAINT_NONE) return null;
  if (!task.constraintDate) return null;
  return { type, date: task.constraintDate };
}

export function constraintLabel(task) {
  const c = constraintOf(task);
  if (!c) return '';
  return CONSTRAINT_TYPES.find((t) => t.id === c.type)?.label || '';
}

/* ── Utilidades ────────────────────────────────────────────────── */

/** Garante progresso inteiro dentro de 0–100. */
export function clampProgress(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
