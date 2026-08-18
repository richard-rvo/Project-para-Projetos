import { describe, it, expect } from 'vitest';
import {
  snapForward, snapBackward, addWorkingMinutes, workingMinutesBetween,
  minutesPerDay, dayFraction, instantAt, isWorkingInstant,
} from './worktime';
import { CALENDAR_PRESETS, DEFAULT_CALENDAR } from './calendar';

/* Seg–Sex, 08:00–12:00 e 13:00–17:00 → 480 min/dia. */
const PADRAO = DEFAULT_CALENDAR;
const H24 = CALENDAR_PRESETS.find((c) => c.id === '24h');
const TURNO = { ...PADRAO, id: 'turno', shifts: [{ from: '07:00', to: '13:00' }] }; // 360
const FERIADO = { ...PADRAO, holidays: ['2026-08-12'] };                            // quarta

/* 2026-08-10 é uma SEGUNDA. */
const SEG = '2026-08-10';
const SEX = '2026-08-14';

describe('minutesPerDay', () => {
  it('soma os turnos, ignorando o intervalo', () => {
    expect(minutesPerDay(PADRAO)).toBe(480);
    expect(minutesPerDay(H24)).toBe(1440);
    expect(minutesPerDay(TURNO)).toBe(360);
  });

  it('funde turnos sobrepostos em vez de contar o minuto duas vezes', () => {
    const cal = { ...PADRAO, shifts: [{ from: '08:00', to: '12:00' }, { from: '10:00', to: '17:00' }] };
    expect(minutesPerDay(cal)).toBe(540); // 08:00–17:00, não 240 + 420
  });
});

describe('snapForward — o instante como INÍCIO', () => {
  it('mantém um instante que já está dentro do turno', () => {
    expect(snapForward(PADRAO, `${SEG}T09:30`)).toBe(`${SEG}T09:30`);
  });

  it('adianta para a abertura quando é antes do expediente', () => {
    expect(snapForward(PADRAO, `${SEG}T06:00`)).toBe(`${SEG}T08:00`);
  });

  it('pula o intervalo do almoço', () => {
    expect(snapForward(PADRAO, `${SEG}T12:30`)).toBe(`${SEG}T13:00`);
  });

  it('o fechamento não inicia nada: vai para o próximo dia útil', () => {
    expect(snapForward(PADRAO, `${SEG}T17:00`)).toBe('2026-08-11T08:00');
  });

  it('atravessa o fim de semana', () => {
    expect(snapForward(PADRAO, `${SEX}T17:00`)).toBe('2026-08-17T08:00');
  });

  it('atravessa feriado', () => {
    expect(snapForward(FERIADO, '2026-08-12T09:00')).toBe('2026-08-13T08:00');
  });
});

describe('snapBackward — o instante como TÉRMINO', () => {
  it('o fechamento é um término válido', () => {
    expect(snapBackward(PADRAO, `${SEG}T17:00`)).toBe(`${SEG}T17:00`);
  });

  it('a abertura não termina nada: volta ao dia útil anterior', () => {
    expect(snapBackward(PADRAO, '2026-08-11T08:00')).toBe(`${SEG}T17:00`);
  });

  it('recua do almoço para o fim do turno da manhã', () => {
    expect(snapBackward(PADRAO, `${SEG}T12:30`)).toBe(`${SEG}T12:00`);
  });

  it('volta por cima do fim de semana', () => {
    expect(snapBackward(PADRAO, '2026-08-17T08:00')).toBe(`${SEX}T17:00`);
  });
});

describe('addWorkingMinutes', () => {
  it('um dia cheio vai da abertura ao fechamento', () => {
    expect(addWorkingMinutes(PADRAO, `${SEG}T08:00`, 480)).toBe(`${SEG}T17:00`);
  });

  it('meio dia para no início do almoço', () => {
    expect(addWorkingMinutes(PADRAO, `${SEG}T08:00`, 240)).toBe(`${SEG}T12:00`);
  });

  it('atravessa o almoço sem consumi-lo', () => {
    expect(addWorkingMinutes(PADRAO, `${SEG}T11:00`, 120)).toBe(`${SEG}T14:00`);
  });

  it('cinco dias úteis vão de segunda a sexta', () => {
    expect(addWorkingMinutes(PADRAO, `${SEG}T08:00`, 5 * 480)).toBe(`${SEX}T17:00`);
  });

  it('pula o fim de semana', () => {
    expect(addWorkingMinutes(PADRAO, `${SEX}T13:00`, 480)).toBe('2026-08-17T12:00');
  });

  it('negativo anda para trás', () => {
    expect(addWorkingMinutes(PADRAO, `${SEX}T17:00`, -5 * 480)).toBe(`${SEG}T08:00`);
  });

  it('ida e volta devolve o mesmo instante', () => {
    const start = `${SEG}T09:15`;
    for (const n of [30, 480, 1000, 5000]) {
      expect(addWorkingMinutes(PADRAO, addWorkingMinutes(PADRAO, start, n), -n)).toBe(start);
    }
  });

  it('no calendário 24h a virada de dia não produz 24:00', () => {
    const finish = addWorkingMinutes(H24, `${SEG}T08:00`, 960);
    expect(finish).toBe('2026-08-11T00:00');
    expect(finish).not.toContain('24:00');
  });

  it('o mesmo "3 dias" dura menos tempo de relógio num calendário maior', () => {
    const start = `${SEG}T08:00`;
    expect(addWorkingMinutes(PADRAO, start, 3 * minutesPerDay(PADRAO))).toBe('2026-08-12T17:00');
    expect(addWorkingMinutes(H24, start, 3 * minutesPerDay(H24))).toBe('2026-08-13T08:00');
  });
});

describe('workingMinutesBetween', () => {
  it('conta só o tempo útil, ignorando almoço e fim de semana', () => {
    expect(workingMinutesBetween(PADRAO, `${SEG}T08:00`, `${SEX}T17:00`)).toBe(5 * 480);
    expect(workingMinutesBetween(PADRAO, `${SEG}T11:00`, `${SEG}T14:00`)).toBe(120);
  });

  it('descarta feriado', () => {
    expect(workingMinutesBetween(FERIADO, `${SEG}T08:00`, `${SEX}T17:00`)).toBe(4 * 480);
  });

  it('é anti-simétrica', () => {
    const a = `${SEG}T08:00`;
    const b = '2026-08-12T10:00';
    expect(workingMinutesBetween(PADRAO, a, b)).toBe(-workingMinutesBetween(PADRAO, b, a));
  });

  it('marco (mesmo instante) tem duração zero', () => {
    expect(workingMinutesBetween(PADRAO, `${SEG}T08:00`, `${SEG}T08:00`)).toBe(0);
  });

  it('é o inverso de addWorkingMinutes', () => {
    const start = `${SEG}T08:00`;
    for (const n of [15, 480, 2400]) {
      expect(workingMinutesBetween(PADRAO, start, addWorkingMinutes(PADRAO, start, n))).toBe(n);
    }
  });
});

describe('dayFraction — posição da barra dentro da célula do dia', () => {
  it('a abertura fica na borda esquerda e o fechamento na direita', () => {
    expect(dayFraction(PADRAO, `${SEG}T08:00`)).toBe(0);
    expect(dayFraction(PADRAO, `${SEG}T17:00`)).toBe(1);
  });

  it('13:00 cai depois da metade — a jornada inclui o almoço na régua', () => {
    const f = dayFraction(PADRAO, `${SEG}T13:00`);
    expect(f).toBeCloseTo(300 / 540, 5);
  });

  it('fora da jornada satura em vez de estourar', () => {
    expect(dayFraction(PADRAO, `${SEG}T04:00`)).toBe(0);
    expect(dayFraction(PADRAO, `${SEG}T23:00`)).toBe(1);
  });
});

describe('instantAt', () => {
  it('vira o dia em 1440 em vez de emitir 24:00', () => {
    expect(instantAt(SEG, 1440)).toBe('2026-08-11T00:00');
    expect(instantAt(SEG, 540)).toBe(`${SEG}T09:00`);
  });
});

describe('isWorkingInstant', () => {
  it('reconhece as bordas do turno e recusa o almoço', () => {
    expect(isWorkingInstant(PADRAO, `${SEG}T08:00`)).toBe(true);
    expect(isWorkingInstant(PADRAO, `${SEG}T17:00`)).toBe(true);
    expect(isWorkingInstant(PADRAO, `${SEG}T12:30`)).toBe(false);
    expect(isWorkingInstant(PADRAO, '2026-08-15T10:00')).toBe(false); // sábado
  });
});
