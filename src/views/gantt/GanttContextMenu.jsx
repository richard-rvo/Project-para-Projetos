import React, { useEffect, useRef } from 'react';
import { readDependencies } from '../../utils/dependencies';
import {
  Indent, Outdent, Copy, ClipboardPaste, CopyPlus, Trash2, Link2Off, PenLine,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Menu de contexto da linha (botão direito).

   Uma instância só, posicionada por estado — o mesmo princípio do
   tooltip. Envolver cada linha num ContextMenu do Radix montaria um
   provider por linha; num cronograma de 300 tarefas isso é 300
   árvores de contexto para um menu que aparece um de cada vez.
   ═══════════════════════════════════════════════════════════════ */

export default function GanttContextMenu({ data, onClose, actions, selectionCount }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!data) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    /* mousedown em vez de click: fechar antes que o clique alcance a
       grade evita reposicionar a seleção ao dispensar o menu. */
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [data, onClose]);

  if (!data) return null;

  const plural = selectionCount > 1;
  const run = (fn) => () => { onClose(); fn(); };

  const items = [
    { icon: PenLine, label: 'Abrir detalhes', onSelect: run(() => actions.openDetails(data.task)), hidden: plural },
    { separator: true },
    { icon: Indent, label: 'Indentar', hint: 'Tab', onSelect: run(() => actions.indent(1)) },
    { icon: Outdent, label: 'Desindentar', hint: '⇧Tab', onSelect: run(() => actions.indent(-1)) },
    { separator: true },
    { icon: Copy, label: plural ? 'Copiar tarefas' : 'Copiar', hint: '⌘C', onSelect: run(actions.copy) },
    { icon: ClipboardPaste, label: 'Colar', hint: '⌘V', onSelect: run(actions.paste) },
    { icon: CopyPlus, label: 'Duplicar', hint: '⌘D', onSelect: run(actions.duplicate) },
    { separator: true },
    {
      icon: Link2Off,
      label: 'Remover predecessoras',
      onSelect: run(() => actions.clearDependencies(data.task)),
      disabled: !readDependencies(data.task.dependsOn).length,
      hidden: plural,
    },
    {
      icon: Trash2,
      label: plural ? `Excluir ${selectionCount} tarefas` : 'Excluir',
      hint: '⌫',
      danger: true,
      onSelect: run(actions.remove),
    },
  ];

  /* Vira para dentro da janela quando abre perto da borda. */
  const MENU_W = 232;
  const MENU_H = 300;
  const left = Math.min(data.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(data.y, window.innerHeight - MENU_H - 8);

  return (
    <div ref={ref} className="gantt-ctx" style={{ left, top }} role="menu">
      {items.filter((i) => !i.hidden).map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="gantt-ctx-sep" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`gantt-ctx-item ${item.danger ? 'is-danger' : ''}`}
            onClick={item.onSelect}
            disabled={item.disabled}
          >
            <item.icon size={14} strokeWidth={1.8} />
            <span className="flex-1 text-left">{item.label}</span>
            {item.hint && <kbd className="gantt-ctx-hint">{item.hint}</kbd>}
          </button>
        )
      )}
    </div>
  );
}
