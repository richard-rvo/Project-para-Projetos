import { describe, it, expect } from 'vitest';
import {
  stageOf, stageLabel, isLate, lateDays, isDueWithin, progressForStage,
  countByStage, projectSpan, stateOf, leaves,
} from './taskState';
import { calculateProjectMetrics } from './progress';
import { computeSCurve } from './scurve';
import { upgradeTaskToV5 } from './storage';

/* Datas fixas em torno de um "hoje" explícito: o teste nunca pode
   depender do relógio da máquina que o roda. */
const HOJE = '2026-08-18';
const ONTEM = '2026-08-17';
const SEMANA_PASSADA = '2026-08-11';
const AMANHA = '2026-08-19';
const PROXIMA = '2026-08-25';

const t = (extra) => ({ id: 'x', name: 'x', ...extra });

/* ═══════════════════════════════════════════════════════════════
   ESTÁGIO — a leitura de progresso, nunca um campo à parte
   ═══════════════════════════════════════════════════════════════ */

describe('estágio', () => {
  it('deriva do progresso, na regra do MS Project', () => {
    expect(stageOf(t({ progress: 0 }))).toBe('not-started');
    expect(stageOf(t({ progress: 1 }))).toBe('in-progress');
    expect(stageOf(t({ progress: 99 }))).toBe('in-progress');
    expect(stageOf(t({ progress: 100 }))).toBe('done');
  });

  it('tarefa sem progresso é não iniciada', () => {
    expect(stageOf(t({}))).toBe('not-started');
    expect(stageLabel(t({}))).toBe('Não Iniciada');
  });

  /* A contradição que o campo `status` permitia: 'Concluída' com 0%.
     Agora ela é inexprimível — só existe um dado. */
  it('não há como contradizer o progresso', () => {
    const task = t({ progress: 40, status: 'Concluída' });
    expect(stageOf(task)).toBe('in-progress');
  });

  it('resumo lê o rollup, não o campo cru', () => {
    const summary = t({ progress: 0, rollup: { progress: 100 } });
    expect(stageOf(summary)).toBe('done');
  });
});

/* ═══════════════════════════════════════════════════════════════
   ATRASO — condição medida contra hoje, ortogonal ao estágio
   ═══════════════════════════════════════════════════════════════ */

describe('atraso', () => {
  it('tarefa vencida e incompleta está atrasada', () => {
    expect(isLate(t({ endDate: `${ONTEM}T17:00`, progress: 20 }), HOJE)).toBe(true);
  });

  it('tarefa vencida e concluída NÃO está atrasada', () => {
    expect(isLate(t({ endDate: `${ONTEM}T17:00`, progress: 100 }), HOJE)).toBe(false);
  });

  /* O término é um instante e hoje é uma data-só. Comparados crus, às
     09:00 uma tarefa que termina hoje 17:00 apareceria como atrasada. */
  it('termina hoje à tarde não está atrasada', () => {
    expect(isLate(t({ endDate: `${HOJE}T17:00`, progress: 0 }), HOJE)).toBe(false);
  });

  it('mede quantos dias', () => {
    expect(lateDays(t({ endDate: `${SEMANA_PASSADA}T17:00`, progress: 0 }), HOJE)).toBe(7);
    expect(lateDays(t({ endDate: `${AMANHA}T17:00`, progress: 0 }), HOJE)).toBe(0);
  });

  it('convive com o estágio em vez de substituí-lo', () => {
    const s = stateOf(t({ endDate: `${ONTEM}T17:00`, progress: 40 }), HOJE);
    expect(s.stage).toBe('in-progress');
    expect(s.late).toBe(true);
    expect(s.lateDays).toBe(1);
  });

  it('tarefa sem término nunca está atrasada', () => {
    expect(isLate(t({ progress: 0 }), HOJE)).toBe(false);
  });
});

describe('vencendo em breve', () => {
  it('conta só o que vence dentro da janela e não está pronto', () => {
    expect(isDueWithin(t({ endDate: `${AMANHA}T17:00`, progress: 0 }), 7, HOJE)).toBe(true);
    expect(isDueWithin(t({ endDate: `${PROXIMA}T17:00`, progress: 0 }), 7, HOJE)).toBe(true);
    expect(isDueWithin(t({ endDate: '2026-09-30T17:00', progress: 0 }), 7, HOJE)).toBe(false);
    expect(isDueWithin(t({ endDate: `${AMANHA}T17:00`, progress: 100 }), 7, HOJE)).toBe(false);
    /* Já vencida não é "vencendo": é atrasada, outra pergunta. */
    expect(isDueWithin(t({ endDate: `${ONTEM}T17:00`, progress: 0 }), 7, HOJE)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════
   AÇÃO SOBRE O ESTÁGIO — arrastar no Quadro escreve progresso
   ═══════════════════════════════════════════════════════════════ */

describe('progressForStage', () => {
  it('concluir é 100, reabrir é 0', () => {
    expect(progressForStage('done', 40)).toBe(100);
    expect(progressForStage('not-started', 40)).toBe(0);
  });

  it('mover para em andamento PRESERVA um progresso intermediário', () => {
    expect(progressForStage('in-progress', 35)).toBe(35);
  });

  it('só um valor de ponta precisa de um novo', () => {
    expect(progressForStage('in-progress', 0)).toBe(50);
    expect(progressForStage('in-progress', 100)).toBe(50);
  });
});

/* ═══════════════════════════════════════════════════════════════
   FOLHAS — o resumo não é trabalho, é a soma dos filhos
   ═══════════════════════════════════════════════════════════════ */

describe('leaves', () => {
  const hierarquia = [
    t({ id: 'grupo', projectId: 1, order: 0, indentLevel: 0 }),
    t({ id: 'f1', projectId: 1, order: 1, indentLevel: 1 }),
    t({ id: 'f2', projectId: 1, order: 2, indentLevel: 1 }),
    t({ id: 'solta', projectId: 1, order: 3, indentLevel: 0 }),
  ];

  it('descarta quem tem filhos', () => {
    expect(leaves(hierarquia).map((x) => x.id)).toEqual(['f1', 'f2', 'solta']);
  });

  it('separa por projeto — o último de um não vira pai do primeiro do outro', () => {
    const misto = [
      t({ id: 'a', projectId: 1, order: 0, indentLevel: 0 }),
      t({ id: 'b', projectId: 2, order: 0, indentLevel: 1 }),
    ];
    expect(leaves(misto).map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  /* O resumo GUARDA datas próprias, que fora do Gantt ninguém troca
     pelo rollup. Contá-lo marcava como atrasado um cabeçalho de bloco
     cuja data guardada era de meses atrás. */
  it('resumo com data guardada antiga não conta como atrasado', () => {
    const comResumo = [
      t({ id: 'g', projectId: 1, order: 0, indentLevel: 0, endDate: `${SEMANA_PASSADA}T17:00`, progress: 0 }),
      t({ id: 'f', projectId: 1, order: 1, indentLevel: 1, endDate: `${PROXIMA}T17:00`, progress: 50 }),
    ];
    expect(countByStage(comResumo, HOJE).late).toBe(0);
    expect(countByStage(comResumo, HOJE).total).toBe(1);
  });

  it('métricas não contam o mesmo trabalho duas vezes', () => {
    const filho = {
      startDate: '2026-08-03T08:00', endDate: '2026-08-07T17:00', progress: 100,
    };
    const soFilho = calculateProjectMetrics([t({ id: 'f', projectId: 1, order: 0, indentLevel: 0, ...filho })]);
    const comPai = calculateProjectMetrics([
      t({ id: 'g', projectId: 1, order: 0, indentLevel: 0, ...filho, progress: 0 }),
      t({ id: 'f', projectId: 1, order: 1, indentLevel: 1, ...filho }),
    ]);
    /* O pai com 0% não pode puxar o projeto para 50%. */
    expect(soFilho.progress).toBe(100);
    expect(comPai.progress).toBe(100);
  });
});

describe('contagens', () => {
  const tasks = [
    t({ id: 'a', progress: 0, endDate: `${PROXIMA}T17:00` }),
    t({ id: 'b', progress: 50, endDate: `${ONTEM}T17:00` }),
    t({ id: 'c', progress: 100, endDate: `${ONTEM}T17:00` }),
    t({ id: 'd', progress: 0, endDate: `${SEMANA_PASSADA}T17:00` }),
  ];

  it('conta estágio e atraso separadamente', () => {
    const c = countByStage(tasks, HOJE);
    expect(c).toMatchObject({
      'not-started': 2, 'in-progress': 1, done: 1, late: 2, total: 4,
    });
  });

  it('período real vem das tarefas', () => {
    const span = projectSpan([
      t({ startDate: `${SEMANA_PASSADA}T08:00`, endDate: `${ONTEM}T17:00` }),
      t({ startDate: `${HOJE}T08:00`, endDate: `${PROXIMA}T17:00` }),
    ]);
    expect(span.start).toBe(`${SEMANA_PASSADA}T08:00`);
    expect(span.end).toBe(`${PROXIMA}T17:00`);
  });
});

/* ═══════════════════════════════════════════════════════════════
   PLANEJADO — só existe com linha de base
   ═══════════════════════════════════════════════════════════════ */

describe('métricas do projeto', () => {
  const semBase = [
    t({ id: 'a', startDate: `${SEMANA_PASSADA}T08:00`, endDate: `${PROXIMA}T17:00`, progress: 30 }),
  ];

  it('sem linha de base não inventa planejado nem saúde', () => {
    const m = calculateProjectMetrics(semBase);
    expect(m.hasBaseline).toBe(false);
    expect(m.planned).toBeNull();
    expect(m.deviation).toBeNull();
    expect(m.health).toBe('Sem base');
    /* Realizado continua existindo: não depende de haver plano. */
    expect(m.progress).toBe(30);
  });

  it('com linha de base, compara contra ela e não contra as datas atuais', () => {
    /* A tarefa foi replanejada para muito além da baseline: é o caso
       em que o cálculo antigo perdia o atraso, porque o "planejado"
       andava junto com o término. */
    const m = calculateProjectMetrics([
      t({
        id: 'a',
        baselineStart: '2026-08-03T08:00',
        baselineEnd: '2026-08-07T17:00',
        startDate: '2026-08-03T08:00',
        endDate: '2026-09-30T17:00',
        progress: 10,
      }),
    ]);
    expect(m.hasBaseline).toBe(true);
    /* A baseline terminou antes de hoje → deveria estar 100%. */
    expect(m.planned).toBe(100);
    expect(m.deviation).toBe(-90);
    expect(m.health).toBe('Crítica');
  });

  it('reporta a cobertura da linha de base', () => {
    const m = calculateProjectMetrics([
      t({ id: 'a', baselineStart: '2026-08-03T08:00', baselineEnd: '2026-08-07T17:00', progress: 0 }),
      t({ id: 'b', progress: 0 }),
    ]);
    expect(m.baselineCoverage).toBe(50);
  });
});

describe('curva S', () => {
  it('sem linha de base não desenha planejado', () => {
    const curve = computeSCurve([
      t({ startDate: `${SEMANA_PASSADA}T08:00`, endDate: `${PROXIMA}T17:00`, progress: 40 }),
    ]);
    expect(curve.hasBaseline).toBe(false);
    expect(curve.points.every((p) => p.planned === null)).toBe(true);
    expect(curve.deviation).toBe(0);
  });

  it('a janela cobre baseline E execução derrapada', () => {
    const curve = computeSCurve([
      t({
        startDate: '2026-08-03T08:00',
        endDate: '2026-09-30T17:00',
        baselineStart: '2026-08-03T08:00',
        baselineEnd: '2026-08-07T17:00',
        progress: 10,
      }),
    ]);
    expect(curve.hasBaseline).toBe(true);
    expect(curve.minDate).toBe('2026-08-03');
    expect(curve.maxDate).toBe('2026-09-30');
  });
});

/* ═══════════════════════════════════════════════════════════════
   MIGRAÇÃO v4 → v5
   ═══════════════════════════════════════════════════════════════ */

describe('migração v5', () => {
  it('guarda o status original antes de removê-lo', () => {
    const next = upgradeTaskToV5({ id: 'a', status: 'Em Andamento', progress: 30 });
    expect(next.status).toBeUndefined();
    expect(next.statusLegacy).toBe('Em Andamento');
    expect(next.progress).toBe(30);
  });

  /* 'Concluída' é inequívoco: sem esta reconciliação a tarefa voltaria
     a aparecer como não concluída depois da migração. */
  it("'Concluída' com progresso parcial vira 100%", () => {
    const next = upgradeTaskToV5({ id: 'a', status: 'Concluída', progress: 40 });
    expect(next.progress).toBe(100);
    expect(stageOf(next)).toBe('done');
  });

  it('não inventa progresso para os demais', () => {
    const next = upgradeTaskToV5({ id: 'a', status: 'Em Andamento', progress: 0 });
    expect(next.progress).toBe(0);
    expect(stageOf(next)).toBe('not-started');
  });

  it("'Atrasada' deixa de ser dado e passa a ser medida", () => {
    const next = upgradeTaskToV5({
      id: 'a', status: 'Atrasada', progress: 20, endDate: `${ONTEM}T17:00`,
    });
    expect(next.status).toBeUndefined();
    expect(isLate(next, HOJE)).toBe(true);
  });

  it('é idempotente', () => {
    const once = upgradeTaskToV5({ id: 'a', status: 'Concluída', progress: 100 });
    expect(upgradeTaskToV5(once)).toBe(once);
  });
});

/* ═══════════════════════════════════════════════════════════════
   COERÊNCIA ENTRE TELAS — o que esta auditoria existe para garantir
   ═══════════════════════════════════════════════════════════════ */

describe('Curva S e métricas não podem discordar', () => {
  const tasks = [
    t({
      id: 'a', projectId: 1, order: 0, indentLevel: 0,
      baselineStart: '2026-08-03T08:00', baselineEnd: '2026-08-14T17:00',
      startDate: '2026-08-03T08:00', endDate: '2026-09-11T17:00', progress: 30,
    }),
    t({
      id: 'b', projectId: 1, order: 1, indentLevel: 0,
      baselineStart: '2026-08-10T08:00', baselineEnd: '2026-08-21T17:00',
      startDate: '2026-08-17T08:00', endDate: '2026-09-25T17:00', progress: 10,
    }),
  ];

  it('o desvio é o MESMO número nas duas', () => {
    const m = calculateProjectMetrics(tasks);
    const c = computeSCurve(tasks);
    expect(c.deviation).toBe(m.deviation);
    expect(c.plannedToday).toBe(m.planned);
    expect(c.actualToday).toBe(m.earned);
  });

  it('realizado ao lado de planejado usa a mesma ponderação', () => {
    const m = calculateProjectMetrics(tasks);
    /* `earned` pondera pelo orçamento da baseline, como `planned`.
       `progress` pondera pela duração atual — outra pergunta. */
    expect(m.earned).not.toBeNull();
    expect(m.deviation).toBe(m.earned - m.planned);
  });
});
