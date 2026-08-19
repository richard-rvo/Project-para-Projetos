import React from 'react';
import MiniTimeline from './MiniTimeline';

/* ═══════════════════════════════════════════════════════════════
   Timeline do portfólio: todos os projetos lado a lado.

   É a visão que a grade de cards não consegue dar — sobreposição,
   sequência e onde está a concentração de trabalho no calendário.
   ═══════════════════════════════════════════════════════════════ */

function toneFor(project, metrics) {
  if (metrics.health === 'Crítica') return 'late';
  if (metrics.health === 'Atenção') return 'at-risk';
  if (project.status === 'Concluído') return 'done';
  return 'on-track';
}

export default function PortfolioTimeline({ rows, onOpen }) {
  const items = rows.map(({ project, metrics }) => ({
    id: project.id,
    label: project.name,
    start: project.startDate,
    end: project.endDate,
    progress: metrics.progress,
    tone: toneFor(project, metrics),
  }));

  /* Projeto sem datas não pode ser desenhado. Dizer isso é melhor do
     que deixá-lo sumir sem explicação. */
  const undated = items.filter((i) => !i.start || !i.end).length;

  return (
    <div className="flex flex-col gap-2">
      <MiniTimeline
        items={items}
        labelWidth="clamp(240px, 30%, 360px)"
        rowHeight={34}
        onSelect={(item) => onOpen(item.id)}
        emptyMessage="Nenhum projeto tem início e término definidos."
      />
      {undated > 0 && (
        <p className="text-micro text-text-3">
          {undated} projeto{undated !== 1 ? 's' : ''} sem datas não aparece
          {undated !== 1 ? 'm' : ''} aqui.
        </p>
      )}
    </div>
  );
}
