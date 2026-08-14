import React from 'react';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ViewBarButton } from '../../components/shell/ViewBar';
import { Filter, X } from 'lucide-react';
import { GROUP_OPTIONS, EMPTY_FILTERS, hasActiveFilters } from './useGanttFilters';
import { STATUS_OPTIONS } from './ganttConfig';

export default function GanttFilterMenu({ filters, onChange, filteredOut }) {
  const active = hasActiveFilters(filters);
  const grouping = filters.group !== 'none';

  const toggleStatus = (status) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ViewBarButton icon={Filter} active={active || grouping}>
          {active || grouping ? (
            <span className="flex items-center gap-1">
              Filtros
              {filteredOut > 0 && (
                <span className="rounded-full bg-brand px-1.5 text-micro font-semibold tabular-nums text-white">
                  {filteredOut}
                </span>
              )}
            </span>
          ) : (
            'Filtros'
          )}
        </ViewBarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Agrupar por
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.group}
          onValueChange={(group) => onChange({ ...filters, group })}
        >
          {GROUP_OPTIONS.map((opt) => (
            <DropdownMenuRadioItem key={opt.id} value={opt.id}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Status
        </DropdownMenuLabel>
        {STATUS_OPTIONS.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={filters.statuses.includes(status)}
            onCheckedChange={() => toggleStatus(status)}
            onSelect={(e) => e.preventDefault()}
          >
            {status}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filters.onlyCritical}
          onCheckedChange={(v) => onChange({ ...filters, onlyCritical: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Só o caminho crítico
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={filters.onlyLate}
          onCheckedChange={(v) => onChange({ ...filters, onlyLate: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Só atrasadas
        </DropdownMenuCheckboxItem>

        {(active || grouping) && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_FILTERS })}
              className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-body text-text-2 transition-colors hover:bg-surface-3 hover:text-text-1"
            >
              <X size={13} /> Limpar tudo
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
