import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
        'flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-surface-1 px-3',
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
  return <Separator orientation="vertical" className="mx-1 h-5" />;
}

/**
 * Segmented control reutilizável (zoom do Gantt, modos do Portfólio…).
 * @param {{id:string,label:string}[]} options
 */
export function ViewBarSegments({ options, value, onChange, className }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      size="sm"
      className={className}
      aria-label="Modo de visualização"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <ToggleGroupItem
            key={opt.id}
            value={opt.id}
            title={opt.title}
          >
            {Icon && <Icon data-icon="inline-start" />}
            {opt.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/**
 * Botão de ação da barra: ghost por padrão, sólido quando primário.
 *
 * `forwardRef` não é enfeite: este botão é usado como
 * `<DropdownMenuTrigger asChild>`, e o Radix precisa do nó DOM para
 * ancorar o menu e devolver o foco ao fechar. Sem ele o React
 * descartava a ref, e o menu abria fora da tela (medido: gatilho em
 * x=1404, menu em x=0 / y=−925) com o Escape jogando o foco no body.
 */
export const ViewBarButton = React.forwardRef(function ViewBarButton({
  icon: Icon,
  children,
  active,
  variant = 'ghost',
  disabled,
  className,
  ...props
}, ref) {
  const buttonVariant = variant === 'primary'
    ? 'default'
    : active
      ? 'navActive'
      : 'ghost';

  return (
    <Button
      ref={ref}
      type="button"
      disabled={disabled}
      variant={buttonVariant}
      size={children ? 'sm' : 'icon-sm'}
      className={cn('shrink-0', className)}
      {...props}
    >
      {Icon && <Icon data-icon={children ? 'inline-start' : undefined} />}
      {children}
    </Button>
  );
});
