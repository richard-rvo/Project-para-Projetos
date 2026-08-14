import { useState, useEffect, useCallback, useMemo } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Janela visível do scroller — a base da virtualização.

   Sem isto, um cronograma de 1.000 tarefas monta 1.000 linhas × ~30
   nós cada, mais um <path> por dependência e um tick por dia. O
   navegador aguenta montar; o que ele não aguenta é recalcular tudo
   isso a cada quadro de scroll.

   O scroll é lido com rAF: o evento dispara dezenas de vezes por
   segundo, mas só precisamos de um estado por quadro.
   ═══════════════════════════════════════════════════════════════ */

export function useScrollViewport(ref) {
  const [viewport, setViewport] = useState({
    top: 0, left: 0, width: 0, height: 0,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let frame = null;
    const read = () => {
      frame = null;
      setViewport((prev) => {
        const next = {
          top: el.scrollTop,
          left: el.scrollLeft,
          width: el.clientWidth,
          height: el.clientHeight,
        };
        /* Evita re-render quando nada mudou de fato — o listener de
           scroll dispara mesmo em quique de trackpad. */
        return prev.top === next.top && prev.left === next.left
          && prev.width === next.width && prev.height === next.height
          ? prev
          : next;
      });
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(read);
    };

    read();
    el.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver(read);
    observer.observe(el);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [ref]);

  return viewport;
}

/**
 * Fatia de linhas a renderizar.
 * `overscan` mantém algumas linhas fora de vista montadas, para o
 * scroll rápido não mostrar faixa em branco antes do próximo quadro.
 */
/** Fatia inicial, antes de sabermos a altura do scroller. */
const COLD_START_ROWS = 40;

export function useVirtualRows(viewport, totalRows, rowHeight, headerHeight, overscan = 8) {
  return useMemo(() => {
    /* Primeiro render: o efeito que mede o scroller ainda não rodou.
       Renderizar TUDO aqui trava a thread em cronogramas grandes — o
       primeiro paint de 1.000 linhas é justamente o que a
       virtualização existe para evitar. Uma fatia conservadora basta;
       o ResizeObserver corrige no quadro seguinte. */
    if (!rowHeight || !viewport.height) {
      const end = Math.min(totalRows, COLD_START_ROWS);
      return {
        start: 0,
        end,
        padTop: 0,
        padBottom: Math.max(0, (totalRows - end) * (rowHeight || 0)),
        virtualised: end < totalRows,
      };
    }

    const scrolledIntoRows = Math.max(0, viewport.top - headerHeight);
    const first = Math.floor(scrolledIntoRows / rowHeight);
    const visible = Math.ceil(viewport.height / rowHeight);

    const start = Math.max(0, first - overscan);
    const end = Math.min(totalRows, first + visible + overscan);

    return {
      start,
      end,
      padTop: start * rowHeight,
      padBottom: Math.max(0, (totalRows - end) * rowHeight),
      virtualised: end - start < totalRows,
    };
  }, [viewport.top, viewport.height, totalRows, rowHeight, headerHeight, overscan]);
}

/**
 * Faixa de dias visível na horizontal. Usada para cortar os ticks do
 * cabeçalho: em zoom de mês, três anos de projeto seriam ~1.100 divs
 * dos quais o usuário vê algumas dezenas.
 */
export function useVirtualDays(viewport, gridWidth, dayWidth, totalDays, overscan = 20) {
  return useMemo(() => {
    if (!dayWidth || !viewport.width) return { first: 0, last: totalDays };

    const first = Math.max(0, Math.floor(viewport.left / dayWidth) - overscan);
    const visible = Math.ceil((viewport.width + gridWidth) / dayWidth);
    const last = Math.min(totalDays, first + visible + overscan * 2);
    return { first, last };
  }, [viewport.left, viewport.width, gridWidth, dayWidth, totalDays, overscan]);
}

/** ⌘/Ctrl + scroll altera o zoom em vez de rolar a página. */
export function useZoomOnWheel(ref, onZoom) {
  const handler = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    onZoom(e.deltaY < 0 ? 1 : -1, e.clientX);
  }, [onZoom]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    /* passive: false porque precisamos de preventDefault — sem isso o
       navegador faz zoom da página inteira. */
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [ref, handler]);
}
