import { useContext } from 'react';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { AppContext } from '@/context/AppContext';

/**
 * O shadcn entrega este componente acoplado ao `next-themes`. O Projeta
 * já tem tema próprio no AppContext (persistido e refletido em
 * data-theme no <html>), então lemos de lá — uma fonte de verdade só.
 */
const Toaster = ({ ...props }) => {
  const { state } = useContext(AppContext);

  return (
    <Sonner
      theme={state?.theme === 'dark' ? 'dark' : 'light'}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius-card)',
      }}
      {...props}
    />
  );
};

export { Toaster };
