import { useMemo } from 'react';
import { viewStart, viewEnd } from './useGanttTasks';

/* ═══════════════════════════════════════════════════════════════
   Filtros e agrupamento do Gantt.

   Agrupar SUBSTITUI a hierarquia em vez de conviver com ela: uma
   árvore de resumo dentro de grupos por responsável produz duas
   estruturas concorrentes na mesma coluna e ninguém consegue ler.
   É o que MS Project e ClickUp também fazem.
   ═══════════════════════════════════════════════════════════════ */

export const GROUP_OPTIONS = [
  { id: 'none', label: 'Sem agrupamento' },
  { id: 'status', label: 'Status' },
  { id: 'resourceGroup', label: 'Grupo de recurso' },
  { id: 'resources', label: 'Recursos' },
];

export const EMPTY_FILTERS = {
  text: '',
  statuses: [],
  group: 'none',
  onlyCritical: false,
  onlyLate: false,
};

export function hasActiveFilters(f) {
  return Boolean(
    f.text.trim() || f.statuses.length || f.onlyCritical || f.onlyLate
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

    const matches = (t) => {
      if (term && !String(t.name || '').toLowerCase().includes(term)) return false;
      if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
      if (filters.onlyLate && t.status !== 'Atrasada') return false;
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
      const raw = task[filters.group];
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
