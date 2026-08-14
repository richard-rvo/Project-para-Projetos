import { useState, useCallback, useRef } from 'react';
import { readDependencies, wouldCreateCycle } from '../../utils/dependencies';

/* ═══════════════════════════════════════════════════════════════
   Ligar tarefas arrastando.

   O DESIGN.md descrevia um ponto conector com linha elástica desde
   sempre — mas o comportamento nunca existiu no código. Aqui ele é
   implementado de fato.

   Enquanto arrasta, o alvo é descoberto por elementFromPoint em vez
   de listeners por barra: uma varredura por movimento, em vez de N
   handlers montados o tempo todo.
   ═══════════════════════════════════════════════════════════════ */

export function useGanttLinking({ tasks, scrollerRef, onLink }) {
  const [linkDrag, setLinkDrag] = useState(null);
  const stateRef = useRef(null);

  const findTaskAt = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    const host = el?.closest('[data-task-id]');
    return host?.getAttribute('data-task-id') || null;
  }, []);

  const beginLink = useCallback((e, sourceTask, side) => {
    e.preventDefault();
    e.stopPropagation();

    const scroller = scrollerRef.current;
    if (!scroller) return;

    const toLocal = (ev) => {
      const box = scroller.getBoundingClientRect();
      return {
        x: ev.clientX - box.left + scroller.scrollLeft,
        y: ev.clientY - box.top + scroller.scrollTop,
      };
    };

    const origin = toLocal(e);
    stateRef.current = { sourceTask, side, targetId: null };
    setLinkDrag({ from: origin, to: origin, sourceId: sourceTask.id, targetId: null });

    const onMove = (ev) => {
      const targetId = findTaskAt(ev.clientX, ev.clientY);
      const valid = targetId && targetId !== sourceTask.id;
      stateRef.current.targetId = valid ? targetId : null;
      setLinkDrag((prev) => prev && { ...prev, to: toLocal(ev), targetId: valid ? targetId : null });
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const { targetId } = stateRef.current || {};
      setLinkDrag(null);
      stateRef.current = null;
      if (!targetId) return;

      const target = tasks.find((t) => t.id === targetId);
      if (!target) return;

      /* Arrastar da direita da origem cria origem → alvo.
         Arrastar da esquerda inverte o sentido. */
      const [predecessor, successor] =
        side === 'right' ? [sourceTask, target] : [target, sourceTask];

      await onLink(predecessor, successor);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [tasks, scrollerRef, findTaskAt, onLink]);

  return { linkDrag, beginLink };
}

/**
 * Adiciona `predecessor` à lista de predecessoras de `successor`.
 * Recusa duplicatas, auto-referência e ciclos — sem isso o forward
 * pass do auto-agendamento entraria em laço.
 *
 * @returns {{ok: boolean, reason?: string, task?: object}}
 */
export function linkTasks(predecessor, successor, allTasks) {
  if (predecessor.id === successor.id) {
    return { ok: false, reason: 'Uma tarefa não pode depender de si mesma.' };
  }

  const existing = readDependencies(successor.dependsOn);
  if (existing.some((d) => d.id === predecessor.id)) {
    return { ok: false, reason: 'Essa dependência já existe.' };
  }

  if (wouldCreateCycle(predecessor.id, successor.id, allTasks)) {
    return { ok: false, reason: 'Isso criaria uma dependência circular.' };
  }

  return {
    ok: true,
    /* Ligação por arrasto cria sempre FS sem defasagem — tipo e lag
       se ajustam depois, na célula ou no Inspector. */
    task: {
      ...successor,
      dependsOn: [...existing, { id: predecessor.id, type: 'FS', lag: 0 }],
    },
  };
}
