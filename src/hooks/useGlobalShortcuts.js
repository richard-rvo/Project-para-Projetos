import { useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';

/* ═══════════════════════════════════════════════════════════════
   Atalhos de aplicação.

   Desfazer é um comando do PRODUTO, não da view. Enquanto vivia
   dentro do teclado do Gantt, ⌘Z parava de funcionar assim que o
   Inspector abria — justamente quando o usuário mais edita.

   ⌘K (paleta) continua no CommandPalette, que já é global.
   ═══════════════════════════════════════════════════════════════ */

/** Digitando num campo, deixamos o desfazer nativo do input agir. */
function isTextEntry(el) {
  const tag = el?.tagName;
  return (
    (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(el.type)) ||
    tag === 'TEXTAREA' ||
    el?.isContentEditable
  );
}

export function useGlobalShortcuts() {
  const { undo, redo } = useContext(AppContext);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if (isTextEntry(e.target)) return;
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
}
