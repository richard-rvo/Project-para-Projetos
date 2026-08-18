import { useMemo } from 'react';
import {
  viewStart, viewEnd, stageOf, isLate, labelForStage,
} from '../../utils/taskState';
import { today } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Filtros e agrupamento do Gantt.

   Agrupar SUBSTITUI a hierarquia em vez de conviver com ela: uma
   árvore de resumo dentro de grupos por responsável produz duas
   estruturas concorrentes na mesma coluna e ninguém consegue ler.
   É o que MS Project e ClickUp também fazem.
   ═══════════════════════════════════════════════════════════════ */

export const GROUP_OPTIONS = [
  { id: 'none', label: 'Sem agrupamento' },
  { id: 'stage', label: 'Estado' },
  { id: 'resourceGroup', label: 'Grupo de recurso' },
  { id: 'resources', label: 'Recursos' },
];

export const EMPTY_FILTERS = {
  text: '',
  stages: [],
  group: 'none',
  onlyCritical: false,
  onlyLate: false,
};

export function hasActiveFilters(f) {
  return Boolean(
    f.text.trim() || f.stages.length || f.onlyCritical || f.onlyLate
  );
}

/**
 * Aplica filtros e devolve a LISTA DE LINHAS a renderizar.
 * Cada linha é `{ kind: 'task' | 'group', ... }` — o cabeçalho de
 * grupo é uma linha como outra qualquer, então a virtualização não
 * precisa saber que ele existe.
 */
export function useGanttRows(tasks, filters, criticalIds) {
  return useMemo(() => {
    const term = filters.text.trim().toLowerCase();

    /* Uma leitura de hoje para o filtro inteiro: chamar today() por
       tarefa em 1.000 linhas é trabalho repetido à toa. */
    const ref = today();

    const matches = (t) => {
      if (term && !String(t.name || '').toLowerCase().includes(term)) return false;
      if (filters.stages.length && !filters.stages.includes(stageOf(t))) return false;
      /* Antes comparava com um status que ninguém atribuía, então este
         filtro devolvia lista vazia num cronograma cheio de vencidas. */
      if (filters.onlyLate && !isLate(t, ref)) return false;
      if (filters.onlyCritical && !criticalIds.has(t.id)) return false;
      return true;
    };

    const kept = tasks.filter(matches);

    if (filters.group === 'none') {
      return {
        rows: kept.map((task) => ({ kind: 'task', id: task.id, task })),
        filteredOut: tasks.length - kept.length,
      };
    }

    /* Agrupa preservando a ordem de primeira aparição, para o
       resultado não dançar a cada re-render. */
    const buckets = new Map();
    kept.forEach((task) => {
      const raw = filters.group === 'stage'
        ? labelForStage(stageOf(task))
        : task[filters.group];
      const key = raw && String(raw).trim() ? String(raw).trim() : '— sem valor —';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(task);
    });

    const rows = [];
    for (const [label, items] of buckets) {
      const starts = items.map(viewStart).filter(Boolean).sort();
      const ends = items.map(viewEnd).filter(Boolean).sort();
      rows.push({
        kind: 'group',
        id: `group:${label}`,
        label,
        count: items.length,
        start: starts[0] || null,
        end: ends[ends.length - 1] || null,
      });
      items.forEach((task) => rows.push({ kind: 'task', id: task.id, task }));
    }

    return { rows, filteredOut: tasks.length - kept.length };
  }, [tasks, filters, criticalIds]);
}
