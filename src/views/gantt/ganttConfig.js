/* ═══════════════════════════════════════════════════════════════
   GANTT — configuração declarativa
   ═══════════════════════════════════════════════════════════════

   Colunas, zoom e geometria moram aqui e em nenhum outro lugar.

   A altura de linha vem do token --gantt-row-h, então densidade e
   Gantt não podem divergir. O valor duplicado em JS (ROW_H) existe
   só para o posicionamento das setas de dependência, que é calculado
   em JS — e por isso precisa espelhar o token exatamente.
   ═══════════════════════════════════════════════════════════════ */

import {
  formatDateShort,
  durationDays,
  clampProgress,
} from '../../utils/schedule';
import { calculateTaskPlannedProgress } from '../../utils/progress';
import { viewStart, viewEnd, viewProgress } from './useGanttTasks';

/* ── Zoom ──────────────────────────────────────────────────────── */

export const ZOOM_LEVELS = [
  { id: 'day', label: 'Dia', dayWidth: 32 },
  { id: 'week', label: 'Semana', dayWidth: 13 },
  { id: 'month', label: 'Mês', dayWidth: 4 },
];

export const MIN_DAY_W = 1.5;
export const MAX_DAY_W = 90;

/**
 * A granularidade do eixo decorre da largura do dia, não de um preset.
 * É o que permite zoom contínuo — "ajustar ao projeto" e ⌘+scroll
 * produzem larguras que nenhum preset teria.
 */
export function tickForDayWidth(dayWidth) {
  if (dayWidth >= 18) return 'day';
  if (dayWidth >= 7) return 'week';
  return 'month';
}

/** Preset mais próximo, para o segmented control acender o certo. */
export function nearestZoomId(dayWidth) {
  return ZOOM_LEVELS.reduce((best, z) =>
    Math.abs(z.dayWidth - dayWidth) < Math.abs(best.dayWidth - dayWidth) ? z : best
  ).id;
}

/* ── Geometria ─────────────────────────────────────────────────── */

export const MONTH_BAND_H = 24;
export const TICK_BAND_H = 28;
export const HEADER_H = MONTH_BAND_H + TICK_BAND_H;

export const MIN_GRID_W = 280;
export const MAX_GRID_W = 900;
export const DEFAULT_GRID_W = 660;
export const SPLITTER_W = 5;

/** Espelha --gantt-row-h de tokens.css. */
export function rowHeightFor(density) {
  return density === 'compact' ? 30 : 40;
}

/* ── Estados ───────────────────────────────────────────────────── */

export const STATUS_OPTIONS = [
  'Não Iniciada',
  'Em Andamento',
  'Concluída',
  'Atrasada',
];

/** Classe modificadora da barra por status — a cor vem do CSS. */
export const STATUS_MODIFIER = {
  'Não Iniciada': 'is-not-started',
  'Em Andamento': 'is-on-track',
  'Concluída': 'is-done',
  'Atrasada': 'is-late',
};

export const DURATION_UNITS = [
  { id: 'days', label: 'Dias' },
  { id: 'hours', label: 'Horas' },
  { id: 'minutes', label: 'Minutos' },
];

/* ── Colunas ───────────────────────────────────────────────────────
   Fonte única para o cabeçalho e para as células. A view Tabela
   consome a mesma lista na Fase 8, o que elimina a divergência atual
   entre o Gantt e a lista de tarefas.

   · field    — propriedade da tarefa
   · render   — texto exibido
   · editable — aceita edição inline
   · summaryLocked — calculado em tarefa-resumo, não editável
   ─────────────────────────────────────────────────────────────── */

export const COLUMNS = [
  {
    id: 'name',
    label: 'Nome da tarefa',
    field: 'name',
    width: 260,
    grow: true,
    align: 'left',
    editable: true,
    type: 'text',
    alwaysOn: true,
    render: (t) => t.name,
  },
  {
    id: 'duration',
    label: 'Duração',
    field: 'duration',
    width: 68,
    align: 'center',
    editable: true,
    type: 'number',
    summaryLocked: true,
    render: (t, ctx) => ctx.formatDuration(ctx.workingDurationOf(t)),
  },
  {
    id: 'start',
    label: 'Início',
    field: 'startDate',
    width: 82,
    align: 'center',
    editable: true,
    type: 'date',
    summaryLocked: true,
    render: (t) => formatDateShort(viewStart(t)),
  },
  {
    id: 'end',
    label: 'Término',
    field: 'endDate',
    width: 82,
    align: 'center',
    editable: true,
    type: 'date',
    summaryLocked: true,
    render: (t) => formatDateShort(viewEnd(t)),
  },
  {
    id: 'progress',
    label: '%',
    field: 'progress',
    width: 58,
    align: 'center',
    editable: true,
    type: 'number',
    summaryLocked: true,
    render: (t) => `${viewProgress(t)}%`,
  },
  {
    id: 'planned',
    label: '% Plan.',
    field: 'plannedProgress',
    width: 62,
    align: 'center',
    editable: false,
    type: 'text',
    render: (t) => `${calculateTaskPlannedProgress(t.baselineStart, t.baselineEnd)}%`,
  },
  {
    id: 'dependencies',
    label: 'Pred.',
    field: 'dependsOn',
    width: 66,
    align: 'center',
    editable: true,
    type: 'text',
    render: (t, ctx) => ctx.predecessorLabel(t.dependsOn),
  },
  {
    id: 'resources',
    label: 'Recursos',
    field: 'resources',
    width: 120,
    align: 'left',
    editable: true,
    type: 'text',
    render: (t) => t.resources || '',
  },
  {
    id: 'resourceGroup',
    label: 'Grupo',
    field: 'resourceGroup',
    width: 110,
    align: 'left',
    editable: true,
    type: 'text',
    render: (t) => t.resourceGroup || '',
  },
  {
    id: 'baselineStart',
    label: 'Início base',
    field: 'baselineStart',
    width: 92,
    align: 'center',
    editable: true,
    type: 'date',
    render: (t) => formatDateShort(t.baselineStart),
  },
  {
    id: 'baselineEnd',
    label: 'Fim base',
    field: 'baselineEnd',
    width: 92,
    align: 'center',
    editable: true,
    type: 'date',
    render: (t) => formatDateShort(t.baselineEnd),
  },
];

export const DEFAULT_VISIBLE_COLUMNS = {
  name: true,
  duration: true,
  start: true,
  end: true,
  progress: true,
  dependencies: true,
  planned: false,
  resources: false,
  resourceGroup: false,
  baselineStart: false,
  baselineEnd: false,
};

const STORAGE_KEY = 'projeta_gantt_columns';

export function loadVisibleColumns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    return { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

export function saveVisibleColumns(visible) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
  } catch {
    /* modo privado do navegador — seguir sem persistir */
  }
}

/* ── Larguras de coluna, por projeto ──────────────────────────────
   Cada cronograma tem nomes de tarefa de comprimento diferente; uma
   largura global obrigaria a reajustar a cada troca de projeto.   */

const WIDTH_KEY = (projectId) => `projeta_gantt_widths_${projectId}`;

export function loadColumnWidths(projectId) {
  if (!projectId) return {};
  try { return JSON.parse(localStorage.getItem(WIDTH_KEY(projectId))) || {}; }
  catch { return {}; }
}

export function saveColumnWidths(projectId, widths) {
  if (!projectId) return;
  try { localStorage.setItem(WIDTH_KEY(projectId), JSON.stringify(widths)); }
  catch { /* modo privado — seguir sem persistir */ }
}

export const MIN_COL_W = 44;
export const MAX_COL_W = 420;
