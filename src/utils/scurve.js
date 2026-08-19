import { addDays, dateOf, daysBetween, durationDays, today } from './schedule';
import { viewProgress, leaves } from './taskState';
import { hasBaseline, calculateProjectMetrics } from './progress';

/* ═══════════════════════════════════════════════════════════════
   CURVA S — planejado vs realizado
   ═══════════════════════════════════════════════════════════════

   A linha "Planejado" vinha das datas ATUAIS das tarefas. Como são
   justamente as datas que o auto-agendamento empurra quando uma
   predecessora atrasa, o planejado perseguia o realizado: o
   cronograma escorregava, a curva azul escorregava junto e o desvio
   voltava para perto de zero. O gráfico não conseguia acusar atraso —
   que é a única coisa que uma Curva S existe para fazer.

   Agora o planejado vem da LINHA DE BASE, como em qualquer análise de
   valor agregado:

       Planejado (PV) = Σ(orçamento × % previsto pela baseline)
       Realizado (EV) = Σ(orçamento × % concluída informada)

   O orçamento de cada tarefa é a duração que o PLANO previu para ela,
   não a que ela tem hoje — senão uma tarefa que dobrou de duração
   passaria a pesar o dobro e diluiria o próprio atraso.

   Sem linha de base não há planejado. A função devolve
   `hasBaseline: false` e só a curva de realizado, para a tela pedir a
   baseline em vez de desenhar uma comparação inventada.
   ═══════════════════════════════════════════════════════════════ */

/**
 * @param {object[]} tasks    tarefas do projeto
 * @param {number}  samples   máximo de pontos (evita rótulos sobrepostos)
 * @returns {{points, totalDays, minDate, maxDate, plannedToday, actualToday,
 *            deviation, hasBaseline, baselineCoverage}}
 */
export function computeSCurve(allTasks, samples = 30) {
  const empty = {
    points: [], totalDays: 0, minDate: null, maxDate: null,
    plannedToday: 0, actualToday: 0, deviation: 0,
    hasBaseline: false, baselineCoverage: 0,
  };
  /* Só folhas: ponderar resumo e filhos juntos contaria o mesmo
     trabalho duas vezes e achataria a curva. */
  const tasks = leaves(allTasks);
  if (!tasks.length) return empty;

  const based = tasks.filter(hasBaseline);
  const withBaseline = based.length > 0;
  const baselineCoverage = Math.round((based.length / tasks.length) * 100);

  /* A curva é amostrada por DIA: o eixo tem um ponto por dia, e
     comparar um instante com uma data-só sairia um dia fora. Os
     instantes entram aqui reduzidos à parte-data.

     A janela cobre baseline E execução: se a obra derrapou para além
     do plano, o trecho derrapado precisa aparecer no gráfico. */
  const starts = tasks
    .flatMap((t) => [dateOf(t.startDate), dateOf(t.baselineStart)])
    .filter(Boolean)
    .sort();
  const ends = tasks
    .flatMap((t) => [dateOf(t.endDate), dateOf(t.baselineEnd)])
    .filter(Boolean)
    .sort();
  if (!starts.length || !ends.length) return empty;

  const minDate = starts[0];
  const maxDate = ends[ends.length - 1];
  /* Geometria usa distância ENTRE datas, não duração inclusiva. Antes
     `durationDays` fazia o domínio terminar um dia depois de maxDate,
     deixando um trecho vazio no fim do eixo X. */
  const totalDays = daysBetween(minDate, maxDate);
  if (totalDays <= 0) return empty;

  const todayStr = today();

  /* Orçamento de prazo: a duração da baseline quando existe, a atual
     quando não. Tarefas sem nenhuma das duas contam como 1 para não
     sumirem da conta. */
  const weightOf = (t) => (hasBaseline(t)
    ? Math.max(1, durationDays(t.baselineStart, t.baselineEnd))
    : Math.max(1, durationDays(t.startDate, t.endDate)));

  const plannedWeight = based.reduce((sum, t) => sum + weightOf(t), 0) || 1;
  const actualWeight = tasks.reduce((sum, t) => sum + weightOf(t), 0) || 1;

  const step = Math.max(1, Math.ceil(totalDays / samples));
  const points = [];

  /* Início, data de controle e término são pontos obrigatórios. Isso
     evita o tooltip dizer "perto de hoje" e garante que as linhas
     realmente alcancem as duas extremidades do eixo. */
  const sampleDays = new Set([0, totalDays]);
  for (let i = 0; i <= totalDays; i += step) sampleDays.add(i);
  const todayDay = daysBetween(minDate, todayStr);
  if (todayDay >= 0 && todayDay <= totalDays) sampleDays.add(todayDay);

  for (const i of [...sampleDays].sort((a, b) => a - b)) {
    const date = addDays(minDate, i);

    /* ── Planejado: fração da BASELINE decorrida até `date` ──── */
    let planned = null;
    if (withBaseline) {
      planned = 0;
      based.forEach((t) => {
        const dur = Math.max(1, durationDays(t.baselineStart, t.baselineEnd));
        const elapsed = durationDays(t.baselineStart, date);
        const share = Math.max(0, Math.min(100, (elapsed / dur) * 100));
        planned += share * (dur / plannedWeight);
      });
      planned = Math.min(100, planned);
    }

    /* ── Realizado: só até hoje — o futuro não tem execução ──── */
    let actual = null;
    if (date <= todayStr) {
      actual = 0;
      tasks.forEach((t) => {
        if (!t.startDate) return;
        const current = viewProgress(t);
        if (current === 0) return;

        const w = weightOf(t);
        /* Distribui o progresso já feito linearmente entre o início e
           hoje (ou o término, se a tarefa foi concluída antes). */
        const finishedEarly =
          current >= 100 && t.endDate && dateOf(t.endDate) < todayStr;
        const spanEnd = finishedEarly ? dateOf(t.endDate) : todayStr;
        const span = Math.max(1, durationDays(t.startDate, spanEnd));
        const elapsed = durationDays(t.startDate, date);

        let historical = 0;
        if (elapsed > 0) {
          historical = elapsed >= span ? current : current * (elapsed / span);
        }
        actual += historical * (w / actualWeight);
      });
      actual = Math.min(100, actual);
    }

    points.push({ day: i, date, planned, actual });
  }

  /* Os NÚMEROS do cabeçalho vêm da mesma fonte que a Visão Geral e o
     relatório usam. A curva desenhada é amostrada por dia e o passo de
     amostragem pode cair perto de hoje, não exatamente nele — isso
     fazia as duas telas mostrarem desvios diferentes por um ponto.
     Forma e leitura numérica são trabalhos distintos: a forma continua
     vindo dos pontos, a leitura vem do cálculo único. */
  const metrics = calculateProjectMetrics(allTasks);
  const withActual = points.filter((p) => p.actual !== null);

  return {
    points,
    totalDays,
    minDate,
    maxDate,
    plannedToday: withBaseline ? metrics.planned : 0,
    actualToday: withBaseline
      ? metrics.earned
      : (withActual.length ? withActual[withActual.length - 1].actual : 0),
    deviation: withBaseline ? metrics.deviation : 0,
    hasBaseline: withBaseline,
    baselineCoverage,
  };
}
