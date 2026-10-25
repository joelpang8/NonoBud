import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Puzzle } from '../game';

const MAX = 38;
const MIN = 14;
/** Below this, cells are hard to hit with a finger, so the zoom button is offered. */
export const COMFORTABLE = 22;
const ZOOMED = 30;

/** Width a row's clue numbers take, in cell units (same estimate as the prototype). */
function clueWidth(p: Puzzle): number {
  return 0.55 * Math.max(...p.rows.map((r) => Math.max(r.length, 1)));
}

/** Pick a cell size that fits the board to the available width. */
export function fitCellSize(avail: number, p: Puzzle): number {
  return Math.max(MIN, Math.floor(Math.min(MAX, (avail - 6) / (p.n + clueWidth(p)))));
}

export function useCellSize(stage: RefObject<HTMLElement | null>, puzzle: Puzzle, zoomed: boolean) {
  const [fit, setFit] = useState(() => fitCellSize(Math.min(window.innerWidth, 640) - 32, puzzle));

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setFit(fitCellSize(el.clientWidth || Math.min(window.innerWidth, 640) - 32, puzzle));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage, puzzle]);

  return { cs: zoomed ? Math.max(fit, ZOOMED) : fit, fit, canZoom: fit < COMFORTABLE };
}
