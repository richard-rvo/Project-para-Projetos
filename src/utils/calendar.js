import { addDays, daysBetween, dayOfWeek, parseISO } from './schedule';

/* ═══════════════════════════════════════════════════════════════
   CALENDÁRIO DE TRABALHO
   ═══════════════════════════════════════════════════════════════

   Até aqui o auto-agendamento somava dias corridos: mover uma tarefa
   que terminava na sexta empurrava a sucessora para o sábado. O
   cronograma ficava impossível de cumprir e o planejador precisava
   corrigir à mão toda vez.

   Duração passa a ser contada em DIAS ÚTEIS, como no MS Project.
   Nenhuma data existente é reescrita pela migração — o que muda é
   como a duração daquele intervalo é contada e como novas datas são
   calculadas.
   ═══════════════════════════════════════════════════════════════ */

/** Seg–Sex, sem feriados. */
export const DEFAULT_CALENDAR = {
  workdays: [1, 2, 3, 4, 5], // 0 = domingo … 6 = sábado
  holidays: [],
};

/** Aceita projeto, calendário ou nada. */
export function calendarOf(source) {
  const cal = source?.calendar || source || DEFAULT_CALENDAR;
  return {
    workdays: Array.isArray(cal.workdays) && cal.workdays.length
      ? cal.workdays
      : DEFAULT_CALENDAR.workdays,
    holidays: Array.isArray(cal.holidays) ? cal.holidays : [],
  };
}

export function isWorkingDay(dateStr, cal = DEFAULT_CALENDAR) {
  if (!dateStr) return false;
  if (cal.holidays?.includes(dateStr)) return false;
  return cal.workdays.includes(dayOfWeek(dateStr));
}

/**
 * Primeiro dia útil em `dateStr` ou depois.
 * O limite de 400 impede laço infinito caso alguém configure um
 * calendário sem nenhum dia útil.
 */
export function nextWorkingDay(dateStr, cal = DEFAULT_CALENDAR) {
  let d = dateStr;
  for (let i = 0; i < 400; i++) {
    if (isWorkingDay(d, cal)) return d;
    d = addDays(d, 1);
  }
  return dateStr;
}

export function previousWorkingDay(dateStr, cal = DEFAULT_CALENDAR) {
  let d = dateStr;
  for (let i = 0; i < 400; i++) {
    if (isWorkingDay(d, cal)) return d;
    d = addDays(d, -1);
  }
  return dateStr;
}

/**
 * Duração em dias úteis, inclusiva nas duas pontas — mesma convenção
 * de schedule.durationDays, só que pulando não-úteis.
 * Um intervalo inteiramente sobre não-úteis conta 1, para nenhuma
 * tarefa ter duração zero.
 */
export function workingDuration(start, end, cal = DEFAULT_CALENDAR) {
  if (!start || !end) return 0;
  const span = daysBetween(start, end);
  if (span < 0) return 0;

  let count = 0;
  for (let i = 0; i <= span; i++) {
    if (isWorkingDay(addDays(start, i), cal)) count++;
  }
  return Math.max(1, count);
}

/**
 * Término que dá exatamente `duration` dias úteis a partir de `start`.
 * O início é empurrado para o próximo dia útil se cair fora.
 */
export function endFromWorkingDuration(start, duration, cal = DEFAULT_CALENDAR) {
  if (!start) return '';
  const from = nextWorkingDay(start, cal);
  const target = Math.max(1, Math.round(duration));

  let counted = 0;
  let cursor = from;
  for (let i = 0; i < 4000; i++) {
    if (isWorkingDay(cursor, cal)) {
      counted++;
      if (counted >= target) return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** Desloca em N dias úteis (N pode ser negativo). Zero devolve o próprio dia. */
export function shiftWorkingDays(dateStr, n, cal = DEFAULT_CALENDAR) {
  if (!dateStr || n === 0) return dateStr;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cursor = dateStr;

  for (let i = 0; i < 4000 && remaining > 0; i++) {
    cursor = addDays(cursor, step);
    if (isWorkingDay(cursor, cal)) remaining--;
  }
  return cursor;
}

/** Lista de feriados dentro da janela — usada para sombrear a timeline. */
export function holidaysBetween(from, to, cal = DEFAULT_CALENDAR) {
  return (cal.holidays || []).filter((h) => h >= from && h <= to);
}

/** Valida uma data ISO digitada pelo usuário no editor de feriados. */
export function isValidISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseISO(value) !== null;
}
