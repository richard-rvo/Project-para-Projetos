import React, { useCallback, useMemo } from 'react';
import { viewStart, viewEnd } from './useGanttTasks';

/* ═══════════════════════════════════════════════════════════════
   Minimapa: o projeto inteiro numa faixa, com a janela visível
   destacada.

   Com "ajustar à tela" já existindo, o minimapa não serve para ver o
   todo — serve para saber ONDE você está quando o zoom é fechado, e
   para pular direto. Por isso é uma tira fina, não um segundo Gantt.
   ═══════════════════════════════════════════════════════════════ */

const TONE = {
  'Concluída': 'var(--sched-done)',
  'Em Andamento': 'var(--sched-on-track)',
  'Atrasada': 'var(--sched-late)',
};

export default function GanttMinimap({ tasks, layout, viewport, gridWidth, scrollerRef }) {
  const marks = useMemo(() => {
    if (!layout.totalDays) return [];
    /* Uma tarefa some numa tira de 40px de altura; agregamos por faixa
       para o desenho continuar legível em 1.000 linhas. */
    return tasks.slice(0, 400).map((t) => {
      const start = viewStart(t);
      const end = viewEnd(t);
      if (!start || !end) return null;
      const left = (layout.xOf(start) / layout.totalWidth) * 100;
      const width = Math.max(0.25, (layout.widthOf(start, end) / layout.totalWidth) * 100);
      return { id: t.id, left, width, tone: TONE[t.status] || 'var(--sched-not-started)' };
    }).filter(Boolean);
  }, [tasks, layout]);

  const timelineWidth = Math.max(1, viewport.width - gridWidth);
  const windowLeft = (viewport.left / layout.totalWidth) * 100;
  const windowWidth = Math.min(100, (timelineWidth / layout.totalWidth) * 100);

  const jumpTo = useCallback((e) => {
    const el = scrollerRef.current;
    if (!el) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    el.scrollLeft = Math.max(0, ratio * layout.totalWidth - timelineWidth / 2);
  }, [scrollerRef, layout.totalWidth, timelineWidth]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const strip = e.currentTarget.parentElement;
    const move = (ev) => {
      const box = strip.getBoundingClientRect();
      const ratio = (ev.clientX - box.left) / box.width;
      if (scrollerRef.current) {
        scrollerRef.current.scrollLeft = Math.max(0, ratio * layout.totalWidth - timelineWidth / 2);
      }
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [scrollerRef, layout.totalWidth, timelineWidth]);

  if (!marks.length || windowWidth >= 99.5) return null;

  return (
    <div className="gantt-minimap">
      <div className="gantt-minimap-strip" onMouseDown={jumpTo}>
        {marks.map((m) => (
          <span
            key={m.id}
            className="gantt-minimap-mark"
            style={{ left: `${m.left}%`, width: `${m.width}%`, background: m.tone }}
          />
        ))}

        {layout.todayVisible && (
          <span
            className="gantt-minimap-today"
            style={{ left: `${(layout.todayX / layout.totalWidth) * 100}%` }}
          />
        )}

        <span
          className="gantt-minimap-window"
          style={{ left: `${windowLeft}%`, width: `${windowWidth}%` }}
          onMouseDown={startDrag}
        />
      </div>
    </div>
  );
}
