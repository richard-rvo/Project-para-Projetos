import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes condicionais e resolve conflitos de utilitários Tailwind
 * (o último vence). Usado por todo componente shadcn/ui.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
