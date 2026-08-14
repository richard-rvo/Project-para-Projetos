import React, { useState } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ViewBarButton } from '../../components/shell/ViewBar';
import { Calendar, X, Plus } from 'lucide-react';
import { calendarOf, isValidISODate } from '../../utils/calendar';
import { formatDateLong } from '../../utils/schedule';

/* ═══════════════════════════════════════════════════════════════
   Calendário de trabalho do projeto.

   Dias úteis e feriados definem onde o auto-agendamento pode pousar
   uma tarefa. Antes o motor somava dias corridos, então uma tarefa
   que terminava na sexta liberava a sucessora no sábado.
   ═══════════════════════════════════════════════════════════════ */

const WEEKDAYS = [
  { id: 1, label: 'S', full: 'Segunda' },
  { id: 2, label: 'T', full: 'Terça' },
  { id: 3, label: 'Q', full: 'Quarta' },
  { id: 4, label: 'Q', full: 'Quinta' },
  { id: 5, label: 'S', full: 'Sexta' },
  { id: 6, label: 'S', full: 'Sábado' },
  { id: 0, label: 'D', full: 'Domingo' },
];

export default function GanttCalendarMenu({ project, onChange }) {
  const cal = calendarOf(project);
  const [newHoliday, setNewHoliday] = useState('');

  const toggleWeekday = (day) => {
    const next = cal.workdays.includes(day)
      ? cal.workdays.filter((d) => d !== day)
      : [...cal.workdays, day].sort();
    /* Um calendário sem nenhum dia útil travaria o agendador. */
    if (!next.length) return;
    onChange({ ...cal, workdays: next });
  };

  const addHoliday = () => {
    if (!isValidISODate(newHoliday) || cal.holidays.includes(newHoliday)) return;
    onChange({ ...cal, holidays: [...cal.holidays, newHoliday].sort() });
    setNewHoliday('');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ViewBarButton icon={Calendar}>Calendário</ViewBarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Dias úteis
        </DropdownMenuLabel>
        <div className="flex gap-1 px-2 pb-2">
          {WEEKDAYS.map((d) => {
            const on = cal.workdays.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                title={d.full}
                onClick={() => toggleWeekday(d.id)}
                className={
                  'size-7 rounded-[6px] text-micro font-semibold transition-colors ' +
                  (on
                    ? 'bg-brand-soft text-brand'
                    : 'bg-surface-3 text-text-3 hover:text-text-2')
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-micro uppercase tracking-wide text-text-3">
          Feriados ({cal.holidays.length})
        </DropdownMenuLabel>

        <div className="max-h-40 overflow-auto px-2">
          {cal.holidays.length === 0 ? (
            <p className="px-1 pb-2 text-micro text-text-3">Nenhum cadastrado.</p>
          ) : (
            <ul className="flex flex-col gap-0.5 pb-1">
              {cal.holidays.map((h) => (
                <li key={h} className="flex items-center gap-2 rounded-[5px] px-1 py-1 hover:bg-surface-2">
                  <span className="flex-1 text-small tabular-nums text-text-1">
                    {formatDateLong(h)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...cal, holidays: cal.holidays.filter((x) => x !== h) })}
                    className="grid size-5 place-items-center rounded-[4px] text-text-3 hover:bg-sched-late-soft hover:text-sched-late"
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
          <input
            type="date"
            value={newHoliday}
            onChange={(e) => setNewHoliday(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHoliday()}
            className="h-7 flex-1 rounded-[5px] border border-line bg-surface-0 px-1.5 text-micro tabular-nums text-text-1"
          />
          <button
            type="button"
            onClick={addHoliday}
            disabled={!isValidISODate(newHoliday)}
            className="grid size-7 place-items-center rounded-[5px] bg-surface-3 text-text-2 transition-colors hover:text-text-1 disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
