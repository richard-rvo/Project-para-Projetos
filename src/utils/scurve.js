import { addDays, durationDays, today } from './schedule';

/* ═══════════════════════════════════════════════════════════════
   CURVA S — planejado vs realizado, ponderado por duração
   ═══════════════════════════════════════════════════════════════

   Este cálculo existia duplicado em PageSCurve e PageReports, com
   implementações quase iguais mas não idênticas — então o mesmo
   projeto podia render curvas diferentes na tela e no relatório
   impresso.

   Ponderação por duração: uma tarefa de 30 dias pesa 30× mais que
   uma de 1 dia. Sem isso, marcos distorceriam a curva inteira.
   ═══════════════════════════════════════════════════════════════ */

/**
 * @param {object[]} tasks    tarefas do projeto
 * @param {number}  samples   máximo de pontos (evita rótulos sobrepostos)
 * @returns {{points, totalDays, minDate, maxDate, plannedToday, actualToday, deviation}}
 */
export function computeSCurve(tasks, samples = 30) {
  const empty = {
    points: [], totalDays: 0, minDate: null, maxDate: null,
    plannedToday: 0, actualToday: 0, deviation: 0,
  };
  if (!tasks?.length) return empty;

  const starts = tasks.map((t) => t.startDate).filter(Boolean).sort();
  const ends = tasks.map((t) => t.endDate).filter(Boolean).sort();
  if (!starts.length || !ends.length) return empty;

  const minDate = starts[0];
  const maxDate = ends[ends.length - 1];
  const totalDays = durationDays(minDate, maxDate);
  if (totalDays <= 0) return empty;

  const todayStr = today();

  /* Peso total = soma das durações. Tarefas sem datas contam como 1
     para não sumirem da conta. */
  const totalWeight =
    tasks.reduce((sum, t) => {
      if (!t.startDate || !t.endDate) return sum;
      return sum + Math.max(1, durationDays(t.startDate, t.endDate));
    }, 0) || 1;

  const step = Math.max(1, Math.floor(totalDays / samples));
  const points = [];

  for (let i = 0; i <= totalDays; i += step) {
    const date = addDays(minDate, i);

    /* Planejado: fração do prazo decorrida em cada tarefa até `date` */
    let planned = 0;
    tasks.forEach((t) => {
      if (!t.startDate || !t.endDate) return;
      const dur = Math.max(1, durationDays(t.startDate, t.endDate));
      const elapsed = durationDays(t.startDate, date);
      const share = Math.max(0, Math.min(100, (elapsed / dur) * 100));
      planned += share * (dur / totalWeight);
    });

    /* Realizado: só até hoje — o futuro não tem execução. */
    let actual = null;
    if (date <= todayStr) {
      actual = 0;
      tasks.forEach((t) => {
        if (!t.startDate) return;
        const current = t.progress || 0;
        if (current === 0) return;

        const dur = Math.max(1, durationDays(t.startDate, t.endDate || todayStr));
        /* Distribui o progresso já feito linearmente entre o início e
           hoje (ou o término, se a tarefa já foi concluída antes). */
        const finishedEarly =
          t.status === 'Concluída' && t.endDate && t.endDate < todayStr;
        const spanEnd = finishedEarly ? t.endDate : todayStr;
        const span = Math.max(1, durationDays(t.startDate, spanEnd));
        const elapsed = durationDays(t.startDate, date);

        let historical = 0;
        if (elapsed > 0) {
          historical = elapsed >= span ? current : current * (elapsed / span);
        }
        actual += historical * (dur / totalWeight);
      });
      actual = Math.min(100, actual);
    }

    points.push({ day: i, date, planned: Math.min(100, planned), actual });
  }

  const withActual = points.filter((p) => p.actual !== null);
  const actualToday = withActual.length ? withActual[withActual.length - 1].actual : 0;
  const nearToday =
    points.find((p) => p.date === todayStr) || withActual[withActual.length - 1] || points[0];
  const plannedToday = nearToday ? nearToday.planned : 0;

  return {
    points,
    totalDays,
    minDate,
    maxDate,
    plannedToday,
    actualToday,
    deviation: actualToday - plannedToday,
  };
}
