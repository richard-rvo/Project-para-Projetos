import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { cn } from '@/lib/utils';
import { CircleCheck, CircleAlert, Info } from 'lucide-react';

const TONE = {
  success: { cls: 'text-sched-done', Icon: CircleCheck },
  error: { cls: 'text-sched-late', Icon: CircleAlert },
  info: { cls: 'text-sched-on-track', Icon: Info },
};

export default function Toast() {
  const { state } = useContext(AppContext);
  if (!state.toast) return null;

  const { cls, Icon } = TONE[state.toast.type] || TONE.info;

  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2.5',
        'rounded-[10px] border border-line bg-surface-1 px-3.5 py-2.5 shadow-elev-4',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
      )}
    >
      <Icon size={16} strokeWidth={1.9} className={cls} />
      <span className="text-body text-text-1">{state.toast.message}</span>
    </div>
  );
}
