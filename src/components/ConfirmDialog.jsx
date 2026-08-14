import React from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

/* Confirmação destrutiva sobre o Dialog do Radix: foco preso,
   Escape e clique fora fecham, e o leitor de tela anuncia o título.
   A versão anterior era uma div solta com CSS próprio. */

export default function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirmar',
}) {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message && (
            <DialogDescription className="leading-relaxed">{message}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <button type="button" onClick={onClose} className={btn}>Cancelar</button>
          <button
            type="button"
            onClick={() => { onConfirm?.(); onClose?.(); }}
            className={cn(btn, 'border-transparent bg-sched-late text-white hover:brightness-110')}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const btn =
  'rounded-[6px] border border-line px-3 py-1.5 text-small font-medium text-text-2 ' +
  'transition-colors hover:bg-surface-3 hover:text-text-1';
