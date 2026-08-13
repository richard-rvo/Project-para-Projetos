import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDateLong } from '../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Curva S compacta — planejado vs realizado.

   A área ENTRE as curvas é o dado que interessa: ela é o atraso (ou
   o adianto). Tingi-la responde "estamos bem?" antes de o usuário
   ler qualquer número — dois traços soltos exigiriam comparar
   alturas mentalmente.
   ═══════════════════════════════════════════════════════════════ */

const PAD = { top: 10, right: 12, bottom: 22, left: 30 };

export default function CurveChart({ curve, height = 190, className }) {
  const [hover, setHover] = useState(null);

  const geo = useMemo(() => {
    const pts = curve?.points || [];
    if (pts.length < 2) return null;

    const W = 600;
    const H = height;
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;

    const x = (day) => PAD.left + (day / Math.max(1, curve.totalDays)) * iw;
    const y = (val) => PAD.top + ih - (val / 100) * ih;

    const line = (key) =>
      pts
        .filter((p) => p[key] !== null)
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.day).toFixed(1)} ${y(p[key]).toFixed(1)}`)
        .join(' ');

    /* A área só existe onde há realizado — o futuro não tem desvio. */
    const done = pts.filter((p) => p.actual !== null);
    const band = done.length >= 2
      ? [
          ...done.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.day).toFixed(1)} ${y(p.planned).toFixed(1)}`),
          ...[...done].reverse().map((p) => `L ${x(p.day).toFixed(1)} ${y(p.actual).toFixed(1)}`),
          'Z',
        ].join(' ')
      : null;

    return { W, H, iw, ih, x, y, pts, done, plannedPath: line('planned'), actualPath: line('actual'), band };
  }, [curve, height]);

  if (!geo) {
    return (
      <p className={cn('py-10 text-center text-small text-text-3', className)}>
        Sem dados suficientes para a curva.
      </p>
    );
  }

  const behind = curve.deviation < 0;

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const svgX = ratio * geo.W;
    let best = null;
    let bestDist = Infinity;
    geo.pts.forEach((p) => {
      const d = Math.abs(geo.x(p.day) - svgX);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    setHover(best ? { point: best, left: ratio * 100 } : null);
  };

  return (
    <div className={cn('relative', className)} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${geo.W} ${geo.H}`} className="w-full" style={{ height }} role="img">
        {/* Grade horizontal + eixo Y */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} x2={geo.W - PAD.right}
              y1={geo.y(v)} y2={geo.y(v)}
              stroke="var(--line-hairline)" strokeWidth="1"
            />
            <text
              x={PAD.left - 6} y={geo.y(v) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--text-3)"
            >
              {v}
            </text>
          </g>
        ))}

        {geo.band && (
          <path
            d={geo.band}
            fill={behind ? 'var(--sched-late)' : 'var(--sched-done)'}
            opacity="0.14"
          />
        )}

        <path d={geo.plannedPath} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={geo.actualPath} fill="none" stroke="var(--sched-on-track)" strokeWidth="2" strokeLinecap="round" />

        {geo.done.length > 0 && (
          <circle
            cx={geo.x(geo.done[geo.done.length - 1].day)}
            cy={geo.y(geo.done[geo.done.length - 1].actual)}
            r="3.5"
            fill="var(--sched-on-track)"
            stroke="var(--surface-1)"
            strokeWidth="1.5"
          />
        )}

        {hover && (
          <line
            x1={geo.x(hover.point.day)} x2={geo.x(hover.point.day)}
            y1={PAD.top} y2={geo.H - PAD.bottom}
            stroke="var(--line-strong)" strokeWidth="1"
          />
        )}

        <text x={PAD.left} y={geo.H - 6} fontSize="9" fill="var(--text-3)">
          {formatDateLong(curve.minDate)}
        </text>
        <text x={geo.W - PAD.right} y={geo.H - 6} fontSize="9" fill="var(--text-3)" textAnchor="end">
          {formatDateLong(curve.maxDate)}
        </text>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-32 -translate-x-1/2 rounded-[8px] border border-line bg-surface-1 px-2.5 py-1.5 shadow-elev-3"
          style={{ left: `${Math.min(88, Math.max(12, hover.left))}%` }}
        >
          <div className="mb-1 text-micro text-text-3">{formatDateLong(hover.point.date)}</div>
          <div className="flex items-center justify-between gap-3 text-micro">
            <span className="text-text-2">Planejado</span>
            <span className="font-semibold tabular-nums text-text-1">
              {Math.round(hover.point.planned)}%
            </span>
          </div>
          {hover.point.actual !== null && (
            <div className="flex items-center justify-between gap-3 text-micro">
              <span className="text-text-2">Realizado</span>
              <span className="font-semibold tabular-nums text-sched-on-track">
                {Math.round(hover.point.actual)}%
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-1 flex items-center gap-4 pl-[30px] text-micro text-text-3">
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-[1.5px] border-dashed border-text-3" /> Planejado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-sched-on-track" /> Realizado
        </span>
      </div>
    </div>
  );
}
