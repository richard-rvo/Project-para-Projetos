import { addDays, dateOf, timeOf, joinDateTime, dayOfWeek } from './schedule';

/* ═══════════════════════════════════════════════════════════════
   TEMPO ÚTIL — a única aritmética de calendário do app
   ═══════════════════════════════════════════════════════════════

   Antes o cronograma andava em DIAS: a menor coisa representável era
   um dia inteiro e o calendário do projeto era um só. Não dava para
   ter uma tarefa de 4 horas, nem para somar uma tarefa de 8h/dia com
   outra que roda 24h — que é justamente o que acontece numa parada de
   manutenção, com equipe administrativa e turno de campo no mesmo
   cronograma.

   Agora o cronograma anda sobre a linha de tempo ÚTIL do calendário
   DA TAREFA, contada em minutos. "3 dias" deixa de ser uma unidade de
   tempo e vira uma forma de escrever `3 × minutosPorDia(calendário)` —
   72h num calendário 24 Horas, 24h no Padrão de 8h.

   ── Convenções ────────────────────────────────────────────────────

   Instante é a string 'YYYY-MM-DDTHH:mm', local-ingênua: sem 'Z', sem
   offset. Continua ordenável por comparação de string, então todo
   `a < b` e todo `.sort()` do app seguem valendo, e continua sem
   carregar fuso horário junto do dado.

   Um turno [08:00, 17:00] é meio-aberto para INÍCIO, e fechado para
   TÉRMINO:

     · INÍCIO é [08:00, 17:00)  — 08:00 inicia; 17:00 já é o dia seguinte
     · TÉRMINO é [08:00, 17:00] — 08:00 pode ser entrega; 17:00 também

   É essa assimetria que faz o encadeamento TI funcionar sem gambiarra:
   a predecessora termina 08:00, e a sucessora pode pegar 08:00; se
   termina sexta 17:00, snapForward devolve segunda 08:00. O `+1 dia`
   que existia no FS some.
   ═══════════════════════════════════════════════════════════════ */

const MAX_DAY_STEPS = 4000; // trava de laço, no espírito de calendar.js

/* ── Normalização ──────────────────────────────────────────────────
   Converter 'HH:mm' e vasculhar arrays a cada chamada dominava o
   custo: o CPM roda sobre todas as tarefas a cada render. O
   calendário normalizado é memorizado por assinatura. */

const cache = new Map();

function signatureOf(cal) {
  return JSON.stringify([cal.workdays, cal.shifts, cal.holidays]);
}

export function minutesOfTime(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

export function timeOfMinutes(min) {
  const clamped = Math.max(0, Math.min(1439, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Instante a partir de dia + minuto do dia, virando o dia quando o
 * minuto chega a 1440.
 *
 * Sem isto um calendário 24 Horas produz '24:00', que não é hora
 * válida e — pior — quebraria a ordenação por string: '…-10T24:00'
 * compara depois de '…-11T00:00' sendo o mesmo instante.
 */
export function instantAt(date, min) {
  const rounded = Math.round(min);
  const days = Math.floor(rounded / 1440);
  const rest = rounded - days * 1440;
  return joinDateTime(days ? addDays(date, days) : date, timeOfMinutes(rest));
}

/**
 * Turnos em minutos, ordenados e sem sobreposição, mais os conjuntos
 * de consulta. Turnos sobrepostos contariam o mesmo minuto duas vezes
 * e inflariam a duração — por isso são fundidos, não só ordenados.
 */
export function normalize(cal) {
  const key = signatureOf(cal);
  const hit = cache.get(key);
  if (hit) return hit;

  const ranges = (cal.shifts || [])
    .map((s) => ({ from: minutesOfTime(s.from), to: minutesOfTime(s.to) }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from);

  const shifts = [];
  for (const r of ranges) {
    const last = shifts[shifts.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else shifts.push({ ...r });
  }

  const norm = {
    shifts,
    workdays: new Set(cal.workdays || []),
    holidays: new Set(cal.holidays || []),
    minutesPerDay: shifts.reduce((sum, s) => sum + (s.to - s.from), 0),
    /* Janela do dia: da abertura ao fechamento, intervalo incluído.
       É o que a barra do Gantt usa para posicionar a fração do dia. */
    windowFrom: shifts.length ? shifts[0].from : 0,
    windowTo: shifts.length ? shifts[shifts.length - 1].to : 0,
  };

  cache.set(key, norm);
  return norm;
}

/* ── Consultas por dia ─────────────────────────────────────────── */

export function isWorkingDay(cal, date) {
  const n = normalize(cal);
  if (!date || !n.shifts.length) return false;
  if (n.holidays.has(date)) return false;
  return n.workdays.has(dayOfWeek(date));
}

/** Turnos do dia em minutos, ou vazio se o dia não é útil. */
export function dayShifts(cal, date) {
  return isWorkingDay(cal, date) ? normalize(cal).shifts : [];
}

/** Minutos úteis de um dia inteiro. */
export function dayMinutes(cal, date) {
  return isWorkingDay(cal, date) ? normalize(cal).minutesPerDay : 0;
}

/** Minutos úteis de um dia cheio do calendário — a base de "1 dia". */
export function minutesPerDay(cal) {
  return normalize(cal).minutesPerDay || 1;
}

/** Primeiro instante útil do dia. Vazio se o dia não é útil. */
export function startOfWorkingDay(cal, date) {
  const shifts = dayShifts(cal, date);
  return shifts.length ? instantAt(date, shifts[0].from) : '';
}

/** Último instante útil do dia. Vazio se o dia não é útil. */
export function endOfWorkingDay(cal, date) {
  const shifts = dayShifts(cal, date);
  return shifts.length ? instantAt(date, shifts[shifts.length - 1].to) : '';
}

/* ── Encaixe ───────────────────────────────────────────────────────
   snapForward trata o instante como INÍCIO; snapBackward, como
   TÉRMINO. Ver a convenção no cabeçalho. */

/** Primeiro instante em que se pode COMEÇAR, em `dt` ou depois. */
export function snapForward(cal, dt) {
  if (!dt) return '';
  let date = dateOf(dt);
  let min = minutesOfTime(timeOf(dt));

  for (let i = 0; i < MAX_DAY_STEPS; i++) {
    for (const shift of dayShifts(cal, date)) {
      if (min < shift.from) return instantAt(date, shift.from);
      if (min < shift.to) return instantAt(date, min);
    }
    date = addDays(date, 1);
    min = 0;
  }
  return dt; // calendário sem dia útil nenhum — devolve o pedido
}

/** Último instante em que se pode TERMINAR, em `dt` ou antes. */
export function snapBackward(cal, dt) {
  if (!dt) return '';
  let date = dateOf(dt);
  let min = minutesOfTime(timeOf(dt));

  for (let i = 0; i < MAX_DAY_STEPS; i++) {
    const shifts = dayShifts(cal, date);
    for (let j = shifts.length - 1; j >= 0; j--) {
      const shift = shifts[j];
      if (min > shift.to) return instantAt(date, shift.to);
      if (min >= shift.from) return instantAt(date, min);
    }
    date = addDays(date, -1);
    min = 1440;
  }
  return dt;
}

/** O instante cai dentro de um turno? */
export function isWorkingInstant(cal, dt) {
  if (!dt) return false;
  const min = minutesOfTime(timeOf(dt));
  return dayShifts(cal, dateOf(dt)).some((s) => min >= s.from && min <= s.to);
}

/* ── Aritmética ────────────────────────────────────────────────── */

/**
 * Desloca `n` minutos ÚTEIS a partir de `dt`. `n` pode ser negativo.
 *
 * Positivo encaixa para frente antes de consumir e devolve um instante
 * de TÉRMINO (pode pousar no fim do turno); negativo encaixa para trás
 * e devolve um instante de INÍCIO. É o que faz
 * `addWorkingMinutes(cal, addWorkingMinutes(cal, t, d), -d) === t`
 * para qualquer `t` já encaixado.
 */
export function addWorkingMinutes(cal, dt, n) {
  if (!dt) return '';
  const steps = Math.round(n);
  if (steps === 0) return dt;
  return steps > 0 ? forward(cal, dt, steps) : backward(cal, dt, -steps);
}

function forward(cal, dt, total) {
  const from = snapForward(cal, dt);
  let date = dateOf(from);
  let min = minutesOfTime(timeOf(from));
  let left = total;

  for (let i = 0; i < MAX_DAY_STEPS; i++) {
    for (const shift of dayShifts(cal, date)) {
      if (min >= shift.to) continue;
      const cursor = Math.max(min, shift.from);
      const available = shift.to - cursor;
      if (left <= available) return instantAt(date, cursor + left);
      left -= available;
    }
    date = addDays(date, 1);
    min = 0;
  }
  return instantAt(date, min);
}

function backward(cal, dt, total) {
  const from = snapBackward(cal, dt);
  let date = dateOf(from);
  let min = minutesOfTime(timeOf(from));
  let left = total;

  for (let i = 0; i < MAX_DAY_STEPS; i++) {
    const shifts = dayShifts(cal, date);
    for (let j = shifts.length - 1; j >= 0; j--) {
      const shift = shifts[j];
      if (min <= shift.from) continue;
      const cursor = Math.min(min, shift.to);
      const available = cursor - shift.from;
      if (left <= available) return instantAt(date, cursor - left);
      left -= available;
    }
    date = addDays(date, -1);
    min = 1440;
  }
  return instantAt(date, min);
}

/**
 * Minutos úteis de `a` até `b`, com sinal. É a duração de uma tarefa
 * quando `a` é o início e `b` o término.
 */
export function workingMinutesBetween(cal, a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  if (a > b) return -workingMinutesBetween(cal, b, a);

  const lastDate = dateOf(b);
  const endMin = minutesOfTime(timeOf(b));
  let date = dateOf(a);
  let min = minutesOfTime(timeOf(a));
  let total = 0;

  for (let i = 0; i < MAX_DAY_STEPS; i++) {
    const isLast = date === lastDate;
    for (const shift of dayShifts(cal, date)) {
      const from = Math.max(min, shift.from);
      const to = Math.min(isLast ? endMin : 1440, shift.to);
      if (to > from) total += to - from;
    }
    if (isLast) return total;
    date = addDays(date, 1);
    min = 0;
  }
  return total;
}

/* ── Geometria ─────────────────────────────────────────────────────
   A barra do Gantt posiciona o instante DENTRO da célula do dia. A
   fração é medida sobre a janela de trabalho (abertura → fechamento),
   não sobre as 24h: com 24h, uma tarefa de um dia inteiro ocuparia um
   terço da célula e o Gantt pareceria quebrado. */

export function dayFraction(cal, dt) {
  if (!dt) return 0;
  const n = normalize(cal);
  const span = n.windowTo - n.windowFrom;
  if (span <= 0) return 0;
  const min = minutesOfTime(timeOf(dt));
  return Math.max(0, Math.min(1, (min - n.windowFrom) / span));
}

/** Janela de trabalho do dia, para réguas e encaixe do arrasto. */
export function dailyWindow(cal) {
  const n = normalize(cal);
  return { from: n.windowFrom, to: n.windowTo };
}

/**
 * Encaixa um instante na grade de `step` minutos dentro da janela do
 * dia — usado pelo arrasto da barra, para o gesto não gerar 08:37.
 */
export function snapToGrid(cal, dt, step = 15) {
  if (!dt) return '';
  const n = normalize(cal);
  const min = minutesOfTime(timeOf(dt));
  const snapped = n.windowFrom + Math.round((min - n.windowFrom) / step) * step;
  return instantAt(dateOf(dt), snapped);
}
