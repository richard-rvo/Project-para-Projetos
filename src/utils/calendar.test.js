import { describe, expect, it } from 'vitest';
import { isValidTime } from './calendar';

describe('calendar time validation', () => {
  it('aceita horários de turno e o fechamento 24:00', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('08:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(true);
  });

  it('rejeita horários incompletos e valores após 24:00', () => {
    expect(isValidTime('8:30')).toBe(false);
    expect(isValidTime('24:01')).toBe(false);
    expect(isValidTime('24:30')).toBe(false);
    expect(isValidTime('25:00')).toBe(false);
  });
});
