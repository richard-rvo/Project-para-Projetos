import { describe, expect, it } from 'vitest';
import {
  dependencyTypeCode,
  formatDependency,
  parseDependencyInput,
  readDependencies,
} from './dependencies';

const rows = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
  { id: 'd', name: 'D' },
];

describe('dependencies — nomenclatura e entrada MS Project pt-BR', () => {
  it('exibe os tipos canônicos como TI, II, TT e IT', () => {
    expect(dependencyTypeCode('FS')).toBe('TI');
    expect(dependencyTypeCode('SS')).toBe('II');
    expect(dependencyTypeCode('FF')).toBe('TT');
    expect(dependencyTypeCode('SF')).toBe('IT');
  });

  it('formata TI como padrão implícito e outros tipos com código português explícito', () => {
    expect(formatDependency({ type: 'FS', lag: 0 }, 2)).toBe('2');
    expect(formatDependency({ type: 'FS', lag: 3 }, 2)).toBe('2+3');
    expect(formatDependency({ type: 'SS', lag: 3 }, 4)).toBe('4II+3');
    expect(formatDependency({ type: 'FF', lag: -1 }, 5)).toBe('5TT-1');
  });

  it('aceita múltiplas predecessoras separadas por ponto e vírgula', () => {
    const { deps, invalid } = parseDependencyInput('1; 2II+3; 4TT-1', rows, 'c');

    expect(invalid).toEqual([]);
    expect(deps).toEqual([
      { id: 'a', type: 'FS', lag: 0 },
      { id: 'b', type: 'SS', lag: 3 },
      { id: 'd', type: 'FF', lag: -1 },
    ]);
  });

  it('mantém compatibilidade com vírgula e códigos FS/SS/FF/SF', () => {
    const { deps, invalid } = parseDependencyInput('1FS, 2SS+2, 4SF', rows, 'c');

    expect(invalid).toEqual([]);
    expect(deps).toEqual([
      { id: 'a', type: 'FS', lag: 0 },
      { id: 'b', type: 'SS', lag: 2 },
      { id: 'd', type: 'SF', lag: 0 },
    ]);
  });

  it('normaliza texto legado com separador novo', () => {
    expect(readDependencies('aTI; bII+1; dIT')).toEqual([
      { id: 'a', type: 'FS', lag: 0 },
      { id: 'b', type: 'SS', lag: 1 },
      { id: 'd', type: 'SF', lag: 0 },
    ]);
  });
});
