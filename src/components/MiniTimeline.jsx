import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  addDays, daysBetween, durationDays, getMonthLabel, today, formatDateLong,
} from '../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Timeline compacta e somente-leitura.

   Um componente, dois usos: as barras do Portfólio (uma linha por
   projeto) e o "estado do cronograma" da Visão Geral (uma linha por
   tarefa). Ambos precisavam do mesmo desenho, e duplicá-lo teria
   criado uma terceira geometria de timeline no app.

   Sem arrasto, sem edição, sem dependências — para isso existe o
   Gantt. Aqui o objetivo é enxergar a forma do cronograma de relance.
   ═══════════════════════════════════════════════════════════════ */

const TONE_BG = {
  'on-track': 'bg-sched-on-track',
  'at-risk': 'bg-sched-at-risk',
  late: 'bg-sched-late',
  done: 'bg-sched-done',
  neutral: 'bg-sched-not-started',
};

/**
 * @param {{id, label, start, end, progress, tone, milestone}[]} items
 * @param {string} [rangeStart] força o início da janela
 * @param {string} [rangeEnd]   força o fim da janela
 */
export default function MiniTimeline({
  items,
  rangeStart,
  rangeEnd,
  labelWidth = 200,
  rowHeight = 28,
  onSelect,
  emptyMessage = 'Sem datas para exibir.',
}) {
  const model = useMemo(() => {
    const dated = items.filter((i) => i.start && i.end);
    if (!dated.length) return null;

    const starts = dated.map((i) => i.start).sort();
    const ends = dated.map((i) => i.end).sort();
    const from = rangeStart || starts[0];
    const to = rangeEnd || ends[ends.length - 1];
    const span = Math.max(1, durationDays(from, to));

    /* Faixas de mês para dar referência temporal sem poluir */
    const months = [];
    let cursor = null;
    for (let d = 0; d < span; d++) {
      const date = addDays(from, d);
      const key = date.slice(0, 7);
      if (!cursor || cursor.key !== key) {
        cursor = { key, label: getMonthLabel(date), start: d, days: 0 };
        months.push(cursor);
      }
      cursor.days++;
    }

    const todayStr = today();
    const todayOffset = daysBetween(from, todayStr);

    return {
      from, to, span, months,
      todayPct: todayOffset >= 0 && todayOffset <= span ? (todayOffset / span) * 100 : null,
      pctOf: (date) => (daysBetween(from, date) / span) * 100,
      widthOf: (s, e) => Math.max((durationDays(s, e) / span) * 100, 0.6),
    };
  }, [items, rangeStart, rangeEnd]);

  if (!model) {
    return <p className="py-6 text-center text-small text-text-3">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-line">
      {/* Faixa de meses */}
      <div className="flex border-b border-line bg-surface-2">
        <div className="shrink-0" style={{ width: labelWidth }} />
        <div className="relative flex flex-1">
          {model.months.map((m) => (
            <div
              key={m.key}
              className="truncate border-l border-line px-1.5 py-1 text-micro font-medium text-text-3 first:border-l-0"
              style={{ width: `${(m.days / model.span) * 100}%` }}
            >
              {m.days / model.span > 0.08 && m.label}
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* Linha de hoje atravessando todas as barras */}
        {model.todayPct !== null && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-sched-late/60"
            style={{ left: `calc(${labelWidth}px + ${model.todayPct}% * (100% - ${labelWidth}px) / 100%)` }}
          />
        )}

        {items.map((item) => {
          const hasDates = item.start && item.end;
          return (
            <div
              key={item.id}
              className={cn(
                'flex items-center border-b border-line last:border-b-0',
                onSelect && 'cursor-pointer transition-colors hover:bg-surface-2'
              )}
              style={{ height: rowHeight }}
              onClick={() => onSelect?.(item)}
              title={hasDates ? `${item.label}\n${formatDateLong(item.start)} → ${formatDateLong(item.end)}` : item.label}
            >
              <div
                className="shrink-0 truncate border-r border-line px-2.5 text-small text-text-1"
                style={{ width: labelWidth }}
              >
                {item.label}
              </div>

              <div className="relative h-full flex-1">
                {hasDates && (
                  item.milestone ? (
                    <span
                      className="absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 rounded-[1px] bg-text-1"
                      style={{ left: `${model.pctOf(item.start)}%` }}
                    />
                  ) : (
                    <div
                      className={cn(
                        'absolute top-1/2 h-[9px] -translate-y-1/2 overflow-hidden rounded-[3px]',
                        TONE_BG[item.tone] || TONE_BG.neutral
                      )}
                      style={{
                        left: `${model.pctOf(item.start)}%`,
                        width: `${model.widthOf(item.start, item.end)}%`,
                      }}
                    >
                      {item.progress > 0 && (
                        <span
                          className="block h-full bg-black/25"
                          style={{ width: `${Math.min(100, item.progress)}%` }}
                        />
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
