import { describe, it, expect } from 'vitest';
import { applyForwardPass, buildProjectTasks } from '../views/gantt/useGanttTasks';
import { analyseSchedule } from './cpm';
import { CALENDAR_PRESETS, DEFAULT_CALENDAR } from './calendar';
import { upgradeProjectToV4, upgradeTaskToV4 } from './storage';
import { SCHEDULE_MODES } from './schedule';

/* 2026-08-10 é SEGUNDA. Padrão: Seg–Sex, 08:00–12:00 / 13:00–17:00. */
const SEG = '2026-08-10';
const TER = '2026-08-11';
const SEX = '2026-08-14';

const H24 = CALENDAR_PRESETS.find((c) => c.id === '24h');

const project = {
  id: 1,
  calendars: [DEFAULT_CALENDAR, H24],
  defaultCalendarId: DEFAULT_CALENDAR.id,
};

/** Tarefa automática de `days` dias no calendário indicado. */
function task(id, start, end, extra = {}) {
  return {
    id,
    projectId: 1,
    name: id,
    startDate: start,
    endDate: end,
    dependsOn: [],
    ...extra,
  };
}

const link = (id, type = 'FS', lag = 0) => [{ id, type, lag }];

/** Aplica o pass a partir de `changedId` e devolve um mapa id → tarefa. */
function schedule(tasks, changedId) {
  const changed = tasks.find((t) => t.id === changedId);
  const out = applyForwardPass(changed, tasks, project);
  return new Map(out.map((t) => [t.id, t]));
}

describe('forward pass — encadeamento', () => {
  it('TI: terminar sexta 17:00 libera a sucessora segunda 08:00', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEX}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').startDate).toBe('2026-08-17T08:00');
    expect(r.get('B').endDate).toBe('2026-08-17T17:00');
  });

  it('TI preserva a duração da sucessora', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T12:00`, { dependsOn: link('A') }), // 4h
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').startDate).toBe(`${TER}T08:00`);
    expect(r.get('B').endDate).toBe(`${TER}T12:00`);
  });

  it('II alinha os inícios', () => {
    const tasks = [
      task('A', `${TER}T08:00`, `${TER}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A', 'SS') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').startDate).toBe(`${TER}T08:00`);
  });

  it('TT alinha os términos', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, '2026-08-12T17:00'),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A', 'FF') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').endDate).toBe('2026-08-12T17:00');
    expect(r.get('B').startDate).toBe('2026-08-12T08:00'); // duração de 1 dia mantida
  });

  it('defasagem é contada em dias úteis do calendário da sucessora', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A', 'FS', 2) }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').startDate).toBe('2026-08-13T08:00'); // ter + 2 = qui
  });

  it('propaga em cadeia', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A') }),
      task('C', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('B') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').startDate).toBe(`${TER}T08:00`);
    expect(r.get('C').startDate).toBe('2026-08-12T08:00');
  });

  it('só empurra para frente — folga existente é preservada', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`),
      task('B', '2026-08-20T08:00', '2026-08-20T17:00', { dependsOn: link('A') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B')).toBeUndefined(); // não foi tocada
  });

  it('tarefa-resumo não é movida — ela é derivada dos filhos', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEX}T17:00`),
      task('P', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A'), hasChildren: true }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('P')).toBeUndefined();
  });
});

describe('forward pass — calendários diferentes na mesma cadeia', () => {
  it('a sucessora é agendada pelo calendário DELA, não pelo do projeto', () => {
    const tasks = [
      task('A', `${SEX}T08:00`, `${SEX}T17:00`),
      task('B', `${SEG}T00:00`, `${SEG}T12:00`, {
        dependsOn: link('A'), calendarId: '24h',
      }),
    ];
    const r = schedule(tasks, 'A');
    /* Num calendário 24h não existe fim de semana: a sucessora começa
       no mesmo instante em que a predecessora termina. */
    expect(r.get('B').startDate).toBe(`${SEX}T17:00`);
    expect(r.get('B').endDate).toBe('2026-08-15T05:00'); // 12h corridas depois
  });

  it('a mesma sucessora no calendário do projeto atravessa o fim de semana', () => {
    const tasks = [
      task('A', `${SEX}T08:00`, `${SEX}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T12:00`, { dependsOn: link('A') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B').startDate).toBe('2026-08-17T08:00');
  });
});

describe('forward pass — modo manual', () => {
  const manual = { scheduleMode: SCHEDULE_MODES.MANUAL };

  it('não move a tarefa manual, mesmo com predecessora', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEX}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A'), ...manual }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B')).toBeUndefined();
  });

  it('a cadeia ATRAVESSA a manual: a sucessora dela é recalculada', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEX}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A'), ...manual }),
      task('C', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('B') }),
    ];
    const r = schedule(tasks, 'A');
    expect(r.get('B')).toBeUndefined();      // manual ficou onde estava
    expect(r.get('C').startDate).toBe(`${TER}T08:00`); // mas C seguiu B
  });
});

describe('CPM', () => {
  it('marca como crítico só quem não tem folga', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`),
      task('B', `${TER}T08:00`, '2026-08-13T17:00', { dependsOn: link('A') }),
      task('C', `${TER}T08:00`, `${TER}T17:00`, { dependsOn: link('A') }),
      task('D', '2026-08-14T08:00', '2026-08-14T17:00', {
        dependsOn: [{ id: 'B', type: 'FS', lag: 0 }, { id: 'C', type: 'FS', lag: 0 }],
      }),
    ];
    const { criticalIds, byId } = analyseSchedule(tasks, project);
    expect(criticalIds.has('A')).toBe(true);
    expect(criticalIds.has('B')).toBe(true);
    expect(criticalIds.has('D')).toBe(true);
    expect(criticalIds.has('C')).toBe(false);   // caminho paralelo mais curto
    expect(byId.get('C').totalSlackDays).toBe(2);
  });

  it('detecta ciclo sem travar', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('B') }),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`, { dependsOn: link('A') }),
    ];
    const { cycles } = analyseSchedule(tasks, project);
    expect(cycles).toHaveLength(2);
  });

  it('mede a violação da tarefa manual sem mover nada', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, '2026-08-12T17:00'),
      task('B', `${TER}T08:00`, `${TER}T17:00`, {
        dependsOn: link('A'), scheduleMode: SCHEDULE_MODES.MANUAL,
      }),
    ];
    const { byId, violatingIds } = analyseSchedule(tasks, project);
    expect(violatingIds.has('B')).toBe(true);
    expect(byId.get('B').es).toBe(`${TER}T08:00`);       // não andou
    expect(byId.get('B').violationMinutes).toBe(2 * 480); // dois dias cedo demais
  });

  it('tarefa automática que respeita a predecessora não viola nada', () => {
    const tasks = [
      task('A', `${SEG}T08:00`, `${SEG}T17:00`),
      task('B', `${TER}T08:00`, `${TER}T17:00`, { dependsOn: link('A') }),
    ];
    const { violatingIds } = analyseSchedule(tasks, project);
    expect(violatingIds.size).toBe(0);
  });
});

describe('migração v3 → v4', () => {
  it('o calendário do projeto vira biblioteca, preservando o original', () => {
    const legacy = { id: 1, calendar: { workdays: [1, 2, 3], holidays: ['2026-09-07'] } };
    const next = upgradeProjectToV4(legacy);
    expect(next.calendars).toHaveLength(1);
    expect(next.calendars[0].workdays).toEqual([1, 2, 3]);
    expect(next.calendars[0].holidays).toEqual(['2026-09-07']);
    expect(next.calendars[0].shifts).toBeTruthy();       // ganhou jornada
    expect(next.defaultCalendarId).toBe(next.calendars[0].id);
    expect(next.calendarLegacy).toEqual(legacy.calendar); // original guardado
    expect(next.calendar).toBeUndefined();
  });

  it('nenhuma data anda: o dia é o mesmo, com abertura e fechamento', () => {
    const next = upgradeTaskToV4(
      { id: 'A', startDate: SEG, endDate: SEX },
      DEFAULT_CALENDAR
    );
    expect(next.startDate).toBe(`${SEG}T08:00`);
    expect(next.endDate).toBe(`${SEX}T17:00`);
    expect(next.datesLegacy.startDate).toBe(SEG);
  });

  /* Sem esta regra todo marco do banco viraria uma tarefa de um dia —
     uma perda que passaria despercebida por semanas. */
  it('marco continua marco', () => {
    const next = upgradeTaskToV4(
      { id: 'M', startDate: SEG, endDate: SEG },
      DEFAULT_CALENDAR
    );
    expect(next.startDate).toBe(next.endDate);
    expect(next.startDate).toBe(`${SEG}T08:00`);
  });

  it('migra a linha de base junto', () => {
    const next = upgradeTaskToV4(
      { id: 'A', startDate: SEG, endDate: SEX, baselineStart: SEG, baselineEnd: TER },
      DEFAULT_CALENDAR
    );
    expect(next.baselineStart).toBe(`${SEG}T08:00`);
    expect(next.baselineEnd).toBe(`${TER}T17:00`);
  });

  it('é idempotente — rodar de novo não mexe em quem já tem hora', () => {
    const once = upgradeTaskToV4({ id: 'A', startDate: SEG, endDate: SEX }, DEFAULT_CALENDAR);
    expect(upgradeTaskToV4(once, DEFAULT_CALENDAR)).toBe(once);

    const proj = upgradeProjectToV4({ id: 1, calendar: { workdays: [1], holidays: [] } });
    expect(upgradeProjectToV4(proj)).toBe(proj);
  });

  it('tolera tarefa sem datas', () => {
    const next = upgradeTaskToV4({ id: 'A' }, DEFAULT_CALENDAR);
    expect(next.startDate).toBeUndefined();
    expect(next.endDate).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════
   Rollup de tarefa-resumo, na regra do MS Project:

     %Concluída do resumo = Σ(Duração Real) / Σ(Duração)
     Duração Real = Duração × %Concluída

   com Duração em TEMPO ÚTIL do calendário de cada tarefa.
   ═══════════════════════════════════════════════════════════════ */

/** Roda o rollup sem React — a lógica é pura, o hook só memoriza. */
function rollupOf(children, proj = project) {
  const tasks = [
    { ...task('P', null, null), indentLevel: 0, order: 0 },
    ...children.map((c, i) => ({ ...c, indentLevel: 1, order: i + 1 })),
  ];
  return buildProjectTasks(tasks, 1, null, proj).find((t) => t.id === 'P').rollup;
}

describe('rollup do resumo — %Concluída', () => {
  it('pondera por tempo ÚTIL, não por dia corrido', () => {
    /* Mesmo trabalho (2 dias úteis cada), mas A atravessa o fim de
       semana. Por dia corrido A pesaria 4 contra 2 e o resumo daria
       33%; a resposta certa é 50%. */
    const r = rollupOf([
      task('A', '2026-08-14T08:00', '2026-08-17T17:00', { progress: 0 }),
      task('B', '2026-08-18T08:00', '2026-08-19T17:00', { progress: 100 }),
    ]);
    expect(r.progress).toBe(50);
  });

  it('pondera pelo calendário DE CADA filho', () => {
    /* Um dia de turno 24h é o triplo do trabalho de um dia de 8h. */
    const r = rollupOf([
      task('A', '2026-08-17T08:00', '2026-08-17T17:00', { progress: 0 }),
      task('B', '2026-08-17T00:00', '2026-08-18T00:00', {
        progress: 100, calendarId: '24h',
      }),
    ]);
    expect(r.progress).toBe(75); // 1440 / (480 + 1440)
  });

  it('marco não carrega peso — concluí-lo não move o pai', () => {
    const semMarco = rollupOf([
      task('A', `${SEG}T08:00`, `${SEG}T17:00`, { progress: 40 }),
    ]);
    const comMarco = rollupOf([
      task('A', `${SEG}T08:00`, `${SEG}T17:00`, { progress: 40 }),
      task('M', `${TER}T08:00`, `${TER}T08:00`, { progress: 100 }),
    ]);
    expect(semMarco.progress).toBe(40);
    expect(comMarco.progress).toBe(40);
  });

  it('só marcos por baixo: média simples em vez de NaN', () => {
    const r = rollupOf([
      task('M1', `${SEG}T08:00`, `${SEG}T08:00`, { progress: 100 }),
      task('M2', `${TER}T08:00`, `${TER}T08:00`, { progress: 0 }),
    ]);
    expect(r.progress).toBe(50);
  });

  it('datas do resumo são o vão dos filhos', () => {
    const r = rollupOf([
      task('A', `${TER}T08:00`, `${TER}T17:00`),
      task('B', `${SEG}T08:00`, `${SEG}T17:00`),
    ]);
    expect(r.startDate).toBe(`${SEG}T08:00`);
    expect(r.endDate).toBe(`${TER}T17:00`);
  });

  it('resumo aninhado contribui com o vão e o progresso dele', () => {
    const tasks = [
      { ...task('RAIZ', null, null), indentLevel: 0, order: 0 },
      { ...task('SUB', null, null), indentLevel: 1, order: 1 },
      { ...task('A', `${SEG}T08:00`, `${SEG}T17:00`, { progress: 100 }), indentLevel: 2, order: 2 },
      { ...task('B', `${TER}T08:00`, `${TER}T17:00`, { progress: 0 }), indentLevel: 2, order: 3 },
    ];
    const out = buildProjectTasks(tasks, 1, null, project);
    expect(out.find((t) => t.id === 'SUB').rollup.progress).toBe(50);
    expect(out.find((t) => t.id === 'RAIZ').rollup.progress).toBe(50);
  });
});
