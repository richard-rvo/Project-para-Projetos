import React from 'react';
import { Plus } from 'lucide-react';
import { getDayOfWeekChar, formatDateShort } from '../../utils/schedule';
import { MONTH_BAND_H, TICK_BAND_H } from './ganttConfig';

/* ═══════════════════════════════════════════════════════════════
   Cabeçalho do Gantt: colunas da planilha + faixas de mês e tick.

   Fica DENTRO do mesmo scroller do corpo. A faixa gruda no topo com
   position: sticky e a parte da planilha gruda também à esquerda —
   é isso que dispensa qualquer sincronização de scroll em JS.

   As colunas são gerenciadas aqui, no próprio cabeçalho: botão
   direito abre o menu da coluna, e o "+" no fim acrescenta.
   ═══════════════════════════════════════════════════════════════ */

export default function GanttHeader({
  columns, gridWidth, layout, zoom, visibleDays,
  onResizeColumn, onColumnMenu, onAddColumn, canAddColumn,
}) {
  /* Ticks só da faixa visível; o resto vira um espaçador. Em zoom de
     mês, três anos seriam ~1.100 divs para dezenas visíveis. */
  const first = visibleDays?.first ?? 0;
  const last = visibleDays?.last ?? layout.totalDays;
  const ticks = layout.ticks.filter((t) => t.index + t.span >= first && t.index <= last);
  const padLeft = ticks.length ? ticks[0].index * layout.dayWidth : 0;

  return (
    <div className="gantt-head">
      <div className="gantt-head-grid" style={{ width: gridWidth }}>
        <div className="gantt-hcell gantt-cell-index">#</div>

        {columns.map((col) => (
          <div
            key={col.id}
            className="gantt-hcell"
            style={{
              width: col.width,
              flex: col.grow ? '1 1 auto' : `0 0 ${col.width}px`,
              justifyContent:
                col.align === 'center' ? 'center'
                  : col.align === 'right' ? 'flex-end'
                    : 'flex-start',
            }}
            title={`${col.label} — botão direito para opções`}
            onContextMenu={(e) => onColumnMenu?.(e, col)}
          >
            {col.label}
            {onResizeColumn && !col.grow && (
              <span
                className="gantt-col-grip"
                onMouseDown={(e) => onResizeColumn(e, col)}
                title={`Arraste para redimensionar ${col.label}`}
              />
            )}
          </div>
        ))}

        {/* "Adicionar coluna" no fim da planilha, como no MS Project */}
        {canAddColumn && (
          <button
            type="button"
            className="gantt-hcell gantt-hcell-add"
            onClick={(e) => onAddColumn?.(e)}
            title="Adicionar coluna"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="gantt-head-time" style={{ width: layout.totalWidth }}>
        <div className="gantt-band-month" style={{ height: MONTH_BAND_H }}>
          {layout.months.map((month) => {
            const width = month.days * layout.dayWidth;
            return (
              <div key={month.key} className="gantt-month" style={{ width }}>
                {/* Nome inteiro só quando cabe; senão "ago/26"; em faixas
                    muito estreitas, nada — melhor vazio que cortado. */}
                {width > 110 ? <span>{month.label}</span>
                  : width > 44 ? <span>{month.shortLabel}</span>
                    : null}
              </div>
            );
          })}
        </div>

        <div className="gantt-band-tick" style={{ height: TICK_BAND_H }}>
          {padLeft > 0 && <div style={{ width: padLeft, flexShrink: 0 }} aria-hidden="true" />}
          {ticks.map((tick) => (
            <div
              key={tick.date}
              className={[
                'gantt-tick',
                tick.weekend ? 'is-weekend' : '',
                tick.isToday ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
              style={{ width: tick.span * layout.dayWidth }}
            >
              <TickLabel tick={tick} zoom={zoom} width={tick.span * layout.dayWidth} />
            </div>
          ))}
        </div>

        {layout.todayVisible && (
          <div className="gantt-today-pill" style={{ left: layout.todayX }}>
            Hoje
          </div>
        )}
      </div>
    </div>
  );
}

function TickLabel({ tick, zoom, width }) {
  if (zoom.tick === 'day') {
    if (width < 18) return null;
    return (
      <>
        <span className="gantt-tick-num tabular">{Number(tick.date.slice(8, 10))}</span>
        <span className="gantt-tick-dow">{getDayOfWeekChar(tick.date)}</span>
      </>
    );
  }

  if (zoom.tick === 'week') {
    if (width < 36) return null;
    return <span className="gantt-tick-num tabular">{formatDateShort(tick.date).slice(0, 5)}</span>;
  }

  if (width < 44) return null;
  return <span className="gantt-tick-num">{tick.label}</span>;
}
