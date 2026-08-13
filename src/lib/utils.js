import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * O tailwind-merge classifica qualquer `text-*` desconhecido como COR.
 * Nossa escala tipográfica semântica (text-micro … text-display) caía
 * nessa regra, então `cn('text-small', 'text-white')` descartava o
 * tamanho silenciosamente — o texto ficava com a fonte herdada e nada
 * no código denunciava o motivo.
 *
 * Registrar os tokens no grupo font-size resolve o conflito na raiz.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['micro', 'small', 'body', 'read', 'title', 'display'] },
      ],
    },
  },
});

/** Junta classes condicionais e resolve conflitos de utilitários. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
