import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDateLong } from '../utils/schedule';

/* Curva S compartilhada pela visão geral, página analítica e relatório.
   A versão detalhada reserva espaço real para eixos, datas, marcadores
   e leituras; a compacta mantém a mesma geometria sem virar miniatura
   ilegível da tela principal. */

const DETAIL_W = 1280;
const COMPACT_W = 640;

function formatAxisDate(date) {
  if (!date) return '';
  const value = new Date(`${date}T12:00:00`);
  return value.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');
}

function tickPoints(points, totalDays, count) {
  if (!points.length) return [];
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    const target = (totalDays * index) / Math.max(1, count - 1);
    const nearest = points.reduce((best, point) => (
      Math.abs(point.day - target) < Math.abs(best.day - target) ? point : best
    ));
    if (!selected.some((point) => point.date === nearest.date)) selected.push(nearest);
  }
  return selected;
}

function pathFor(points, key, x, y) {
  return points
    .filter((point) => point[key] !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.day).toFixed(1)} ${y(point[key]).toFixed(1)}`)
    .join(' ');
}

export default function CurveChart({
  curve,
  height = 200,
  variant = 'compact',
  className,
}) {
  const [hover, setHover] = useState(null);
  const detailed = variant === 'detail';

  const geo = useMemo(() => {
    const points = curve?.points || [];
    if (points.length < 2) return null;

    const width = detailed ? DETAIL_W : COMPACT_W;
    const pad = detailed
      ? { top: 34, right: 112, bottom: 54, left: 64 }
      : { top: 14, right: 18, bottom: 30, left: 38 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (day) => pad.left + (day / Math.max(1, curve.totalDays)) * plotWidth;
    const y = (value) => pad.top + plotHeight - (value / 100) * plotHeight;
    const plannedPoints = points.filter((point) => point.planned !== null);
    const actualPoints = points.filter((point) => point.actual !== null);
    const comparable = points.filter((point) => point.planned !== null && point.actual !== null);
    const xTicks = tickPoints(points, curve.totalDays, detailed ? 7 : 3);
    const markers = tickPoints(points, curve.totalDays, detailed ? 9 : 4);

    const band = comparable.length >= 2
      ? [
          ...comparable.map((point, index) => (
            `${index === 0 ? 'M' : 'L'} ${x(point.day).toFixed(1)} ${y(point.planned).toFixed(1)}`
          )),
          ...[...comparable].reverse().map((point) => (
            `L ${x(point.day).toFixed(1)} ${y(point.actual).toFixed(1)}`
          )),
          'Z',
        ].join(' ')
      : null;

    return {
      width,
      height,
      pad,
      plotWidth,
      plotHeight,
      plotRight: width - pad.right,
      plotBottom: height - pad.bottom,
      points,
      plannedPoints,
      actualPoints,
      xTicks,
      markers,
      x,
      y,
      plannedPath: pathFor(points, 'planned', x, y),
      actualPath: pathFor(points, 'actual', x, y),
      band,
      controlPoint: actualPoints.at(-1) || null,
      finalPlanned: plannedPoints.at(-1) || null,
    };
  }, [curve, detailed, height]);

  if (!geo) {
    return (
      <p className={cn('py-10 text-center text-small text-text-3', className)}>
        Sem dados suficientes para a curva.
      </p>
    );
  }

  const behind = curve.deviation < 0;
  const control = geo.controlPoint;
  const active = hover?.point || null;
  const activeDelta = active && active.planned !== null && active.actual !== null
    ? active.actual - active.planned
    : null;

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * geo.width;
    const point = geo.points.reduce((best, candidate) => (
      Math.abs(geo.x(candidate.day) - svgX) < Math.abs(geo.x(best.day) - svgX)
        ? candidate
        : best
    ));
    setHover({
      point,
      left: (geo.x(point.day) / geo.width) * 100,
      top: Math.min(68, Math.max(8, ((Math.min(
        geo.y(point.planned ?? 0),
        geo.y(point.actual ?? point.planned ?? 0)
      ) - 30) / geo.height) * 100)),
    });
  };

  const currentLabelX = control
    ? (geo.x(control.day) > geo.plotRight - 76 ? geo.x(control.day) - 72 : geo.x(control.day) + 10)
    : 0;
  const closeAtControl = Boolean(
    control
    && control.planned !== null
    && Math.abs(geo.y(control.planned) - geo.y(control.actual)) < 34
  );

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Curva S de avanço acumulado planejado e realizado"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <text
          x={geo.pad.left}
          y={14}
          fontSize={detailed ? 10 : 8}
          fontWeight="600"
          fill="var(--text-3)"
        >
          AVANÇO ACUMULADO (%)
        </text>

        {control && control.day < curve.totalDays && (
          <rect
            x={geo.x(control.day)}
            y={geo.pad.top}
            width={geo.plotRight - geo.x(control.day)}
            height={geo.plotHeight}
            fill="var(--surface-2)"
            opacity="0.65"
          />
        )}

        {[0, 20, 40, 60, 80, 100].map((value) => (
          <g key={value}>
            <line
              x1={geo.pad.left}
              x2={geo.plotRight}
              y1={geo.y(value)}
              y2={geo.y(value)}
              stroke={value === 0 ? 'var(--line-strong)' : 'var(--line-hairline)'}
              strokeWidth="1"
            />
            <text
              x={geo.pad.left - 10}
              y={geo.y(value) + 4}
              textAnchor="end"
              fontSize={detailed ? 11 : 9}
              fontWeight={value === 0 || value === 100 ? '600' : '400'}
              fill="var(--text-3)"
            >
              {value}%
            </text>
          </g>
        ))}

        {geo.xTicks.map((point, index) => (
          <g key={point.date}>
            {index > 0 && index < geo.xTicks.length - 1 && (
              <line
                x1={geo.x(point.day)}
                x2={geo.x(point.day)}
                y1={geo.pad.top}
                y2={geo.plotBottom}
                stroke="var(--line-hairline)"
                strokeDasharray="2 5"
              />
            )}
            <line
              x1={geo.x(point.day)}
              x2={geo.x(point.day)}
              y1={geo.plotBottom}
              y2={geo.plotBottom + 5}
              stroke="var(--line-strong)"
            />
            <text
              x={geo.x(point.day)}
              y={geo.plotBottom + (detailed ? 22 : 18)}
              textAnchor={index === 0 ? 'start' : index === geo.xTicks.length - 1 ? 'end' : 'middle'}
              fontSize={detailed ? 11 : 9}
              fill="var(--text-3)"
            >
              {formatAxisDate(point.date)}
            </text>
          </g>
        ))}

        {geo.band && (
          <path
            d={geo.band}
            fill={behind ? 'var(--sched-late)' : 'var(--sched-done)'}
            opacity={detailed ? '0.12' : '0.10'}
          />
        )}

        {control && (
          <g>
            <line
              x1={geo.x(control.day)}
              x2={geo.x(control.day)}
              y1={geo.pad.top}
              y2={geo.plotBottom}
              stroke="var(--brand)"
              strokeWidth="1"
              strokeDasharray="3 4"
              opacity="0.7"
            />
            {detailed && (
              <text
                x={geo.x(control.day)}
                y={geo.pad.top - 10}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="var(--brand)"
              >
                HOJE
              </text>
            )}
          </g>
        )}

        {geo.plannedPath && (
          <path
            d={geo.plannedPath}
            fill="none"
            stroke="var(--text-2)"
            strokeWidth={detailed ? '2.2' : '1.6'}
            strokeDasharray="7 6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {geo.actualPath && (
          <path
            d={geo.actualPath}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={detailed ? '3' : '2.2'}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {geo.markers.map((point, index) => {
          const isControl = point.date === control?.date;
          const isFirst = index === 0;
          const isLast = index === geo.markers.length - 1;
          const showValues = detailed && !isFirst && !isLast && !isControl;
          return (
            <g key={`marker-${point.date}`}>
              {point.planned !== null && (
                <>
                  <circle
                    cx={geo.x(point.day)}
                    cy={geo.y(point.planned)}
                    r={detailed ? '3.5' : '2.5'}
                    fill="var(--surface-1)"
                    stroke="var(--text-2)"
                    strokeWidth="1.5"
                  />
                  {showValues && (
                    <text
                      x={geo.x(point.day)}
                      y={Math.max(geo.pad.top + 11, geo.y(point.planned) - 10)}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill="var(--text-2)"
                    >
                      {Math.round(point.planned)}%
                    </text>
                  )}
                </>
              )}
              {point.actual !== null && (
                <>
                  <circle
                    cx={geo.x(point.day)}
                    cy={geo.y(point.actual)}
                    r={detailed ? '4' : '2.8'}
                    fill="var(--brand)"
                    stroke="var(--surface-1)"
                    strokeWidth="1.5"
                  />
                  {showValues && (
                    <text
                      x={geo.x(point.day)}
                      y={Math.min(geo.plotBottom - 7, geo.y(point.actual) + 17)}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="var(--brand)"
                    >
                      {Math.round(point.actual)}%
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {detailed && geo.finalPlanned && geo.finalPlanned.date !== control?.date && (
          <g transform={`translate(${geo.x(geo.finalPlanned.day) + 10} ${geo.y(geo.finalPlanned.planned) - 10})`}>
            <text fontSize="11" fontWeight="600" fill="var(--text-2)">
              {Math.round(geo.finalPlanned.planned)}% plano
            </text>
          </g>
        )}

        {detailed && control && (
          <g>
            {control.planned !== null && (
              <g transform={`translate(${currentLabelX} ${Math.max(
                geo.pad.top + 2,
                geo.y(control.planned) - (closeAtControl ? 28 : 10)
              )})`}>
                <rect width="66" height="21" rx="5" fill="var(--surface-1)" stroke="var(--line-strong)" />
                <text x="8" y="14" fontSize="10" fontWeight="600" fill="var(--text-2)">
                  P {Math.round(control.planned)}%
                </text>
              </g>
            )}
            <g transform={`translate(${currentLabelX} ${Math.min(
              geo.plotBottom - 23,
              geo.y(control.actual) + (closeAtControl ? 8 : -10)
            )})`}>
              <rect width="66" height="21" rx="5" fill="var(--surface-1)" stroke="var(--brand)" />
              <text x="8" y="14" fontSize="10" fontWeight="700" fill="var(--brand)">
                R {Math.round(control.actual)}%
              </text>
            </g>
          </g>
        )}

        {active && (
          <g>
            <line
              x1={geo.x(active.day)}
              x2={geo.x(active.day)}
              y1={geo.pad.top}
              y2={geo.plotBottom}
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            {active.planned !== null && (
              <circle
                cx={geo.x(active.day)} cy={geo.y(active.planned)} r="6"
                fill="var(--surface-1)" stroke="var(--text-2)" strokeWidth="2"
              />
            )}
            {active.actual !== null && (
              <circle
                cx={geo.x(active.day)} cy={geo.y(active.actual)} r="6"
                fill="var(--brand)" stroke="var(--surface-1)" strokeWidth="2"
              />
            )}
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 min-w-44 -translate-x-1/2 rounded-[8px] border border-line bg-surface-1 px-3 py-2 shadow-elev-3"
          style={{ left: `${Math.min(88, Math.max(12, hover.left))}%`, top: `${hover.top}%` }}
        >
          <div className="mb-1.5 border-b border-line pb-1.5 text-micro font-medium text-text-2">
            {formatDateLong(hover.point.date)}
          </div>
          {hover.point.planned !== null && (
            <TooltipRow label="Planejado" value={`${Math.round(hover.point.planned)}%`} />
          )}
          {hover.point.actual !== null && (
            <TooltipRow label="Realizado" value={`${Math.round(hover.point.actual)}%`} actual />
          )}
          {activeDelta !== null && (
            <TooltipRow
              label="Desvio"
              value={`${activeDelta > 0 ? '+' : ''}${Math.round(activeDelta)} p.p.`}
              tone={activeDelta < 0 ? 'late' : 'done'}
            />
          )}
        </div>
      )}

      <div className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-1.5 text-micro text-text-3',
        detailed ? 'mt-3 border-t border-line pt-3' : 'mt-1 pl-[38px]'
      )}>
        <span className="flex items-center gap-2">
          <span className="relative h-2 w-5">
            <span className="absolute inset-x-0 top-1 border-t-2 border-dashed border-text-2" />
            <span className="absolute left-2 top-0.5 size-1.5 rounded-full border border-text-2 bg-surface-1" />
          </span>
          Planejado
        </span>
        <span className="flex items-center gap-2">
          <span className="relative h-2 w-5">
            <span className="absolute inset-x-0 top-1 h-0.5 bg-brand" />
            <span className="absolute left-2 top-0.5 size-1.5 rounded-full bg-brand ring-1 ring-surface-1" />
          </span>
          Realizado
        </span>
        {detailed && (
          <span className={cn('ml-auto font-medium tabular-nums', behind ? 'text-sched-late' : 'text-sched-done')}>
            Desvio atual {curve.deviation > 0 ? '+' : ''}{Math.round(curve.deviation)} p.p.
          </span>
        )}
      </div>
    </div>
  );
}

function TooltipRow({ label, value, actual, tone }) {
  return (
    <div className="flex items-center justify-between gap-5 text-micro">
      <span className="text-text-3">{label}</span>
      <span className={cn(
        'font-semibold tabular-nums text-text-1',
        actual && 'text-brand',
        tone === 'late' && 'text-sched-late',
        tone === 'done' && 'text-sched-done'
      )}>
        {value}
      </span>
    </div>
  );
}
