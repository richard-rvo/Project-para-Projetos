import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Barra de ações da view ativa — o segundo e ÚLTIMO nível de chrome.
 *
 * Regra de divisão com o TopBar: o TopBar diz *onde você está*, a
 * ViewBar diz *o que dá para fazer aqui*. Nada de título repetido.
 *
 * Cada view renderiza a sua. Views sem ações simplesmente não montam
 * a barra e ganham a altura de volta.
 */
export default function ViewBar({ children, className }) {
  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-3',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Empurra o que vier depois para a direita. */
export function ViewBarSpacer() {
  return <div className="ml-auto" />;
}

/** Separador vertical entre grupos de controle. */
export function ViewBarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-line-strong" />;
}

/**
 * Segmented control reutilizável (zoom do Gantt, modos do Portfólio…).
 * @param {{id:string,label:string}[]} options
 */
export function ViewBarSegments({ options, value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-0.5 rounded-[7px] bg-surface-3 p-0.5', className)}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={isActive}
            title={opt.title}
            className={cn(
              'flex h-6.5 items-center gap-1.5 rounded-[5px] px-2',
              'text-small font-medium transition-all duration-100',
              isActive
                ? 'bg-surface-1 text-text-1 shadow-elev-1'
                : 'text-text-2 hover:text-text-1'
            )}
          >
            {Icon && <Icon size={13} strokeWidth={1.9} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Botão de ação da barra: ghost por padrão, sólido quando primário. */
export function ViewBarButton({
  icon: Icon,
  children,
  active,
  variant = 'ghost',
  disabled,
  className,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex h-7.5 shrink-0 items-center gap-1.5 rounded-[6px]',
        /* Sem rótulo o botão vira quadrado, para não ficar um retângulo
           largo com um ícone perdido no meio. */
        children ? 'px-2.5' : 'w-7.5 justify-center px-0',
        'text-small font-medium transition-colors duration-100',
        disabled
          ? 'cursor-not-allowed text-text-3 opacity-45'
          : variant === 'primary'
            ? 'bg-brand text-white hover:bg-brand-hover'
            : active
              ? 'bg-brand-soft text-brand'
              : 'text-text-2 hover:bg-surface-3 hover:text-text-1',
        className
      )}
      {...props}
    >
      {Icon && <Icon size={14} strokeWidth={1.9} />}
      {children}
    </button>
  );
}
