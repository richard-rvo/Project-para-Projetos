import { useCallback, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Teclado do Gantt.

   Regra de divisão do Tab, que é a tecla mais disputada de uma
   grade:

     · editando  → Tab confirma e anda para a célula à direita
     · navegando → Tab indenta, Shift+Tab desindenta

   É o comportamento do MS Project na coluna de tarefas, e a
   hierarquia deixa de depender do modal escondido que era o único
   caminho para indentar antes.
   ═══════════════════════════════════════════════════════════════ */

/** Não sequestrar teclas enquanto o usuário digita em outro lugar. */
function isTypingElsewhere(target, editing) {
  if (editing) return false;
  const tag = target?.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target?.isContentEditable
  );
}

export function useGanttKeyboard({
  enabled,
  tasks,
  columns,
  activeCell,
  setActiveCell,
  editingCell,
  startEdit,
  commitEdit,
  cancelEdit,
  selectedIds,
  setSelectedIds,
  onIndent,
  onDeleteSelected,
  onDuplicateSelected,
  onCopySelected,
  onPasteClipboard,
  onToggleCollapse,
  onUndo,
  onRedo,
}) {
  /* Cálculo FORA de qualquer updater de estado.
     Disparar setSelectedIds de dentro do updater de setActiveCell
     tornava o updater impuro — e o StrictMode roda updaters duas
     vezes, então a seleção avançava dois passos por tecla e as
     edições seguintes atingiam a linha errada. */
  const moveCell = useCallback((rowDelta, colDelta, extendSelection) => {
    if (!tasks.length || !columns.length) return;

    const rowIndex = activeCell ? tasks.findIndex((t) => t.id === activeCell.taskId) : -1;
    const colIndex = activeCell ? columns.findIndex((c) => c.id === activeCell.colId) : -1;

    const nextRow = Math.max(0, Math.min(tasks.length - 1, Math.max(rowIndex, 0) + rowDelta));
    const nextCol = Math.max(0, Math.min(columns.length - 1, Math.max(colIndex, 0) + colDelta));

    const task = tasks[nextRow];
    if (!task) return;

    setActiveCell({ taskId: task.id, colId: columns[nextCol].id });
    setSelectedIds((sel) => {
      if (!extendSelection) return new Set([task.id]);
      const next = new Set(sel);
      next.add(task.id);
      return next;
    });
  }, [activeCell, tasks, columns, setActiveCell, setSelectedIds]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (e) => {
      const editing = Boolean(editingCell);
      if (isTypingElsewhere(e.target, editing)) return;

      /* Fora da view do Gantt o teclado não é nosso. */
      if (!editing && !e.target.closest?.('.gantt-view')) return;

      const mod = e.metaKey || e.ctrlKey;

      /* Desfazer / refazer valem inclusive durante a edição de célula */
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? onRedo() : onUndo();
        return;
      }

      if (editing) {
        if (e.key === 'Tab') {
          e.preventDefault();
          commitEdit();
          moveCell(0, e.shiftKey ? -1 : 1, false);
        }
        return; // Enter e Escape são tratados pelo próprio input
      }

      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); onCopySelected(); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); onPasteClipboard(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); onDuplicateSelected(); return; }

      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveCell(1, 0, e.shiftKey); break;
        case 'ArrowUp': e.preventDefault(); moveCell(-1, 0, e.shiftKey); break;
        case 'ArrowRight':
          e.preventDefault();
          /* Na coluna de nome, seta direita abre o grupo antes de
             andar — igual a um outline. */
          if (activeCell?.colId === 'name') {
            const task = tasks.find((t) => t.id === activeCell.taskId);
            if (task?.hasChildren) { onToggleCollapse(task.id, false); break; }
          }
          moveCell(0, 1, false);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (activeCell?.colId === 'name') {
            const task = tasks.find((t) => t.id === activeCell.taskId);
            if (task?.hasChildren) { onToggleCollapse(task.id, true); break; }
          }
          moveCell(0, -1, false);
          break;
        case 'Enter':
        case 'F2': {
          e.preventDefault();
          const task = tasks.find((t) => t.id === activeCell?.taskId);
          const col = columns.find((c) => c.id === activeCell?.colId);
          if (task && col?.editable && !(task.isSummary && col.summaryLocked)) startEdit(task, col);
          break;
        }
        case 'Tab':
          e.preventDefault();
          onIndent(e.shiftKey ? -1 : 1);
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedIds.size) { e.preventDefault(); onDeleteSelected(); }
          break;
        case 'Escape':
          cancelEdit();
          setSelectedIds(new Set());
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabled, editingCell, activeCell, tasks, columns, selectedIds,
    moveCell, startEdit, commitEdit, cancelEdit, setSelectedIds,
    onIndent, onDeleteSelected, onDuplicateSelected, onCopySelected,
    onPasteClipboard, onToggleCollapse, onUndo, onRedo,
  ]);

  return { moveCell };
}
