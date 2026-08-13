import { useMemo } from 'react';
import { viewStart, viewEnd } from './useGanttTasks';
import {
  addDays,
  daysBetween,
  durationDays,
  getMonthLabel,
  isWeekend,
  today,
} from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Geometria da linha do tempo: converte datas em pixels.

   Toda conversão data→x do Gantt passa por aqui. Antes cada trecho
   do render refazia a conta com o seu próprio offset, e foi assim
   que as setas de dependência acabaram com margens mágicas de −4 e
   +13 espalhadas pelo código.
   ═══════════════════════════════════════════════════════════════ */

const PAD_BEFORE = 7;
const PAD_AFTER = 21;
const MIN_SPAN_DAYS = 120;

export function useGanttLayout(tasks, dayWidth, tick) {
  return useMemo(() => {
    const todayStr = today();

    const starts = tasks.map((t) => viewStart(t)).filter(Boolean).sort();
    const ends = tasks.map((t) => viewEnd(t)).filter(Boolean).sort();

    const firstDate = starts[0] || todayStr;
    const lastDate = ends[ends.length - 1] || addDays(todayStr, 30);

    const rangeStart = addDays(firstDate, -PAD_BEFORE);
    let totalDays = daysBetween(rangeStart, addDays(lastDate, PAD_AFTER));
    if (totalDays < MIN_SPAN_DAYS) totalDays = MIN_SPAN_DAYS;

    /* Dias e faixas de mês numa passada só */
    const days = [];
    const months = [];
    let currentMonth = null;

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
        currentMonth = { key, label: getMonthLabel(date), startIndex: i, days: 0 };
        months.push(currentMonth);
      }
      currentMonth.days++;
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

    /* Conversores — as únicas fórmulas data→pixel do Gantt */
    const xOf = (date) => daysBetween(rangeStart, date) * dayWidth;
    const widthOf = (start, end) =>
      Math.max(durationDays(start, end) * dayWidth, dayWidth);

    return {
      rangeStart,
      totalDays,
      totalWidth,
      days,
      months,
      ticks,
      todayIndex,
      todayVisible: todayIndex >= 0 && todayIndex < totalDays,
      todayX: todayIndex * dayWidth + dayWidth / 2,
      dayWidth,
      xOf,
      widthOf,
      /** Pixel → data, para arrastar e soltar. */
      dateAtX: (x) => addDays(rangeStart, Math.floor(x / dayWidth)),
    };
  }, [tasks, dayWidth, tick]);
}
