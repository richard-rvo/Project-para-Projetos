import React, { useEffect, useRef } from 'react';
import { EyeOff, ArrowLeftToLine, ArrowRightToLine, Check } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Menu da coluna — modelo do MS Project.

   Colunas são gerenciadas ONDE elas estão: clique com o botão
   direito no cabeçalho para ocultar, ajustar largura ou inserir
   vizinhas.

   Isso substitui o dropdown "Colunas" da barra de ferramentas, que
   era uma lista de caixas de seleção longe do objeto que ela
   controlava — e que não deixava escolher POSIÇÃO nenhuma.
   ═══════════════════════════════════════════════════════════════ */

export default function GanttColumnMenu({ data, onClose, actions }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!data) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, [data, onClose]);

  if (!data) return null;

  const { x, y, column, available } = data;
  const run = (fn) => () => { onClose(); fn(); };

  const WIDTH = 246;
  const left = Math.min(x, window.innerWidth - WIDTH - 8);
  const top = Math.min(y, window.innerHeight - 320);

  return (
    <div ref={ref} className="gantt-ctx" style={{ left, top, width: WIDTH }} role="menu">
      <div className="gantt-ctx-title">{column.label}</div>

      <button
        type="button"
        role="menuitem"
        className="gantt-ctx-item"
        disabled={column.alwaysOn}
        onClick={run(() => actions.hide(column.id))}
        title={column.alwaysOn ? 'A coluna de nome não pode ser ocultada' : undefined}
      >
        <EyeOff size={14} strokeWidth={1.8} />
        <span className="flex-1 text-left">Ocultar coluna</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="gantt-ctx-item"
        onClick={run(() => actions.autoFit(column.id))}
      >
        <Check size={14} strokeWidth={1.8} />
        <span className="flex-1 text-left">Ajustar largura</span>
      </button>

      {available.length > 0 && (
        <>
          <div className="gantt-ctx-sep" />
          <div className="gantt-ctx-title">Inserir coluna</div>
          <div className="max-h-56 overflow-auto">
            {available.map((col) => (
              <div key={col.id} className="flex items-center gap-0.5">
                <span className="flex-1 truncate px-2 text-body text-text-1">{col.label}</span>
                <button
                  type="button"
                  title={`Inserir "${col.label}" antes de "${column.label}"`}
                  className="grid size-7 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-surface-3 hover:text-text-1"
                  onClick={run(() => actions.insert(col.id, column.id, 'before'))}
                >
                  <ArrowLeftToLine size={13} />
                </button>
                <button
                  type="button"
                  title={`Inserir "${col.label}" depois de "${column.label}"`}
                  className="mr-1 grid size-7 place-items-center rounded-[5px] text-text-3 transition-colors hover:bg-surface-3 hover:text-text-1"
                  onClick={run(() => actions.insert(col.id, column.id, 'after'))}
                >
                  <ArrowRightToLine size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
