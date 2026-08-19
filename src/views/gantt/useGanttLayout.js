import { useMemo } from 'react';
import { viewStart, viewEnd } from './useGanttTasks';
import {
  addDays,
  daysBetween,
  dateOf,
  getMonthLabel,
  getMonthLabelShort,
  isWeekend,
  today,
} from '../../utils/schedule';
import { dayFraction } from '../../utils/worktime';
import { SUBDAY_MIN_DAY_W, MIN_BAR_W } from './ganttConfig';

/* ═══════════════════════════════════════════════════════════════
   Geometria da linha do tempo: converte datas em pixels.

   Toda conversão data→x do Gantt passa por aqui. Antes cada trecho
   do render refazia a conta com o seu próprio offset, e foi assim
   que as setas de dependência acabaram com margens mágicas de −4 e
   +13 espalhadas pelo código.
   ═══════════════════════════════════════════════════════════════ */

const PAD_BEFORE = 7;
const PAD_AFTER = 21;
export const GANTT_MIN_SPAN_DAYS = 120;

export function useGanttLayout(tasks, dayWidth, tick, calendarFor, options = {}) {
  return useMemo(() => {
    const padBefore = options.padBefore ?? PAD_BEFORE;
    const padAfter = options.padAfter ?? PAD_AFTER;
    const minSpanDays = options.minSpanDays ?? GANTT_MIN_SPAN_DAYS;
    const todayStr = today();

    const starts = tasks.map((t) => viewStart(t)).filter(Boolean).sort();
    const ends = tasks.map((t) => viewEnd(t)).filter(Boolean).sort();

    const firstDate = dateOf(starts[0]) || todayStr;
    const lastDate = dateOf(ends[ends.length - 1]) || addDays(todayStr, 30);

    const rangeStart = addDays(firstDate, -padBefore);
    let totalDays = daysBetween(rangeStart, addDays(lastDate, padAfter));
    if (totalDays < minSpanDays) totalDays = minSpanDays;

    /* Dias e faixas de mês numa passada só */
    const days = [];
    const months = [];
    const years = [];
    let currentMonth = null;
    let currentYear = null;

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(rangeStart, i);
      days.push({
        date,
        index: i,
        weekend: isWeekend(date),
        isToday: date === todayStr,
      });

      const key = date.slice(0, 7);
      if (!currentMonth || currentMonth.key !== key) {
        currentMonth = {
          key,
          label: getMonthLabel(date),
          shortLabel: getMonthLabelShort(date),
          startIndex: i,
          days: 0,
        };
        months.push(currentMonth);
      }
      currentMonth.days++;

      const yearKey = date.slice(0, 4);
      if (!currentYear || currentYear.key !== yearKey) {
        currentYear = {
          key: yearKey,
          label: yearKey,
          startIndex: i,
          days: 0,
        };
        years.push(currentYear);
      }
      currentYear.days++;
    }

    /* Marcações do eixo conforme o zoom: um tick por dia é ilegível
       em zoom de mês, e um por mês é inútil em zoom de dia. */
    const ticks = [];
    if (tick === 'day') {
      days.forEach((d) => ticks.push({ ...d, span: 1 }));
    } else if (tick === 'week') {
      for (let i = 0; i < days.length; i++) {
        const date = days[i].date;
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (dow === 1 || i === 0) {
          const span = Math.min(7 - ((dow + 6) % 7), days.length - i);
          ticks.push({ ...days[i], span });
        }
      }
    } else {
      months.forEach((m) =>
        ticks.push({
          date: days[m.startIndex].date,
          index: m.startIndex,
          span: m.days,
          weekend: false,
          isToday: false,
          label: m.label,
        })
      );
    }

    const totalWidth = totalDays * dayWidth;
    const todayIndex = daysBetween(rangeStart, todayStr);

    /* ── Conversores — as únicas fórmulas data→pixel do Gantt ───────
       Com o dia largo o bastante, o instante posiciona a barra DENTRO
       da célula do dia: das 13:00 às 17:00 ocupa a parte direita.

       A fração é medida sobre a jornada do calendário (abertura →
       fechamento), não sobre as 24 horas do relógio. Sobre 24h, uma
       tarefa de um dia inteiro ocuparia um terço da célula e o Gantt
       pareceria quebrado.

       Abaixo do limiar tudo volta a ser dia inteiro: a fração de um
       dia com 6px de largura é um traço invisível, não informação. */
    const subday = dayWidth >= SUBDAY_MIN_DAY_W;

    const fractionOf = (instant, task) => {
      if (!subday || !calendarFor) return 0;
      return dayFraction(calendarFor(task), instant);
    };

    const xOf = (instant, task) =>
      (daysBetween(rangeStart, instant) + fractionOf(instant, task)) * dayWidth;

    const widthOf = (start, end, task) => {
      const raw = xOf(end, task) - xOf(start, task);
      /* Dia inteiro quando não há sub-dia: o término é o ÚLTIMO dia
         inclusive, então a barra precisa cobrir a célula dele. */
      const span = subday ? raw : raw + dayWidth;
      return Math.max(span, MIN_BAR_W);
    };

    return {
      rangeStart,
      totalDays,
      totalWidth,
      days,
      months,
      years,
      ticks,
      todayIndex,
      todayVisible: todayIndex >= 0 && todayIndex < totalDays,
      todayX: todayIndex * dayWidth + dayWidth / 2,
      dayWidth,
      subday,
      xOf,
      widthOf,
      /** Pixel → dia, para arrastar e soltar. */
      dateAtX: (x) => addDays(rangeStart, Math.floor(x / dayWidth)),
    };
  }, [tasks, dayWidth, tick, calendarFor, options.padBefore, options.padAfter, options.minSpanDays]);
}
