import { memo, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ruleChange, satisfiedLines, strokeRule, type Cell, type CellState, type Change, type Player, type Puzzle, type Stroke, type StrokeRule, type Tool } from '../game';
import { PLAYER_NAMES } from '../lib/players';

interface BoardProps {
  puzzle: Puzzle;
  cells: Cell[];
  player: Player;
  tool: Tool;
  cs: number;
  disabled?: boolean;
  /** Cells to outline as mistakes (after Check). */
  wrong?: ReadonlySet<number>;
  /** Cells to pulse (the partner's recent moves). */
  pulse?: ReadonlySet<number>;
  onStroke: (stroke: Stroke) => void;
  /** Called as each cell changes during a stroke, for sound and vibration. */
  onTouch?: (to: CellState) => void;
}

interface Drag {
  pointerId: number;
  rule: StrokeRule;
  start: number;
  axis: 'row' | 'col' | null;
  changes: Map<number, Change>;
}

const BORDER = 2;

function describe(c: Cell): string {
  if (c.s === 1) return `filled by ${PLAYER_NAMES[c.by ?? 0]}`;
  if (c.s === 2) return 'marked with an X';
  return 'blank';
}

export function Board({ puzzle, cells, player, tool, cs, disabled, wrong, pulse, onStroke, onTouch }: BoardProps) {
  const { n } = puzzle;
  const id = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // Cells touched by the stroke in progress, shown before the stroke is committed.
  const [preview, setPreview] = useState<Map<number, Change> | null>(null);
  // Keyboard cursor. Only drawn while the keyboard is being used.
  const [cursor, setCursor] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  const lastKeyRule = useRef<StrokeRule | null>(null);

  const shown = useMemo(() => {
    if (!preview) return cells;
    const out = cells.slice();
    preview.forEach((c) => (out[c.i] = c.next));
    return out;
  }, [cells, preview]);

  const sat = useMemo(() => satisfiedLines(puzzle, shown), [puzzle, shown]);

  // ---------- touch and mouse ----------

  /** Cell index under the pointer, computed from geometry (no per-cell listeners). */
  const indexAt = (e: PointerEvent, clamp = false): number => {
    const el = gridRef.current;
    if (!el) return -1;
    const r = el.getBoundingClientRect();
    const pitch = (r.width - BORDER * 2) / n;
    let x = Math.floor((e.clientX - r.left - BORDER) / pitch);
    let y = Math.floor((e.clientY - r.top - BORDER) / pitch);
    if (clamp) {
      x = Math.min(n - 1, Math.max(0, x));
      y = Math.min(n - 1, Math.max(0, y));
    } else if (x < 0 || y < 0 || x >= n || y >= n) return -1;
    return y * n + x;
  };

  const touch = (d: Drag, i: number) => {
    if (d.changes.has(i)) return;
    const c = ruleChange(d.rule, i, cells[i], player);
    if (c) {
      d.changes.set(i, c);
      onTouch?.(c.next.s);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setKeyboard(false);
    if (disabled || drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    const i = indexAt(e);
    if (i < 0) return;
    e.preventDefault();
    gridRef.current?.focus({ preventScroll: true });
    setCursor(i);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers refuse capture on synthetic events; dragging still works within the grid */
    }
    const useX = tool === 'x' || e.button === 2;
    const d: Drag = { pointerId: e.pointerId, rule: strokeRule(useX ? 'x' : 'fill', cells[i].s), start: i, axis: null, changes: new Map() };
    touch(d, i);
    drag.current = d;
    setPreview(new Map(d.changes));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const i = indexAt(e, true);
    if (i === d.start && !d.axis) return;
    const sx = d.start % n;
    const sy = Math.floor(d.start / n);
    const x = i % n;
    const y = Math.floor(i / n);
    // Lock to the row or column the drag first moves along (diagonal moves pick the larger direction).
    if (!d.axis) d.axis = Math.abs(x - sx) >= Math.abs(y - sy) ? 'row' : 'col';
    const before = d.changes.size;
    // Fill every cell from the start to the pointer, so fast swipes never skip cells.
    if (d.axis === 'row') {
      for (let k = Math.min(sx, x); k <= Math.max(sx, x); k++) touch(d, sy * n + k);
    } else {
      for (let k = Math.min(sy, y); k <= Math.max(sy, y); k++) touch(d, k * n + sx);
    }
    if (d.changes.size !== before) setPreview(new Map(d.changes));
  };

  const finish = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (d.changes.size) onStroke({ by: player, changes: [...d.changes.values()] });
  };

  // ---------- keyboard ----------
  // Arrows move. Space or Enter fills, X marks, Delete clears. Hold Shift with the
  // arrows to keep doing the last action along the way, like dragging.

  const applyKey = (i: number, rule: StrokeRule) => {
    const c = ruleChange(rule, i, cells[i], player);
    lastKeyRule.current = rule;
    if (!c) return;
    onTouch?.(c.next.s);
    onStroke({ by: player, changes: [c] });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const x = cursor % n;
    const y = Math.floor(cursor / n);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      setKeyboard(true);
      const nx = Math.min(n - 1, Math.max(0, x + mv[0]));
      const ny = Math.min(n - 1, Math.max(0, y + mv[1]));
      const next = ny * n + nx;
      setCursor(next);
      if (e.shiftKey && lastKeyRule.current && !disabled) applyKey(next, lastKeyRule.current);
      return;
    }
    if (disabled) return;
    const s = cells[cursor].s;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setKeyboard(true);
      applyKey(cursor, strokeRule(tool === 'x' ? 'x' : 'fill', s));
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      setKeyboard(true);
      applyKey(cursor, strokeRule('x', s));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setKeyboard(true);
      applyKey(cursor, { applies: (v) => v !== 0, to: 0 });
    }
  };

  const style = { '--cs': `${cs}px` } as CSSProperties;
  const track = { gridTemplateColumns: `repeat(${n}, var(--cs))` };
  const cellId = (i: number) => `${id}-c${i}`;

  return (
    <div className="board" style={style}>
      <div className="corner" />
      <div className="cols" style={track} aria-hidden="true">
        {puzzle.cols.map((c, x) => (
          <div key={x} className={sat.cols[x] ? 'cc ok' : 'cc'}>
            {(c.length ? c : [0]).map((v, k) => (
              <span key={k}>{v}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="rowsc" aria-hidden="true">
        {puzzle.rows.map((r, y) => (
          <div key={y} className={sat.rows[y] ? 'rc ok' : 'rc'}>
            {(r.length ? r : [0]).map((v, k) => (
              <span key={k}>{v}</span>
            ))}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className={keyboard ? 'cells kbd' : 'cells'}
        style={track}
        role="grid"
        aria-label={`Puzzle grid, ${n} by ${n}. Arrow keys move, Space fills, X marks, Delete clears.`}
        aria-activedescendant={cellId(cursor)}
        aria-disabled={disabled || undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setKeyboard(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: n }, (_, y) => (
          <div role="row" key={y} className="grid-row">
            {Array.from({ length: n }, (_, x) => {
              const i = y * n + x;
              return (
                <CellView
                  key={i}
                  id={cellId(i)}
                  i={i}
                  n={n}
                  cell={shown[i]}
                  wrong={!!wrong?.has(i)}
                  pulse={!!pulse?.has(i)}
                  cursor={keyboard && cursor === i}
                  label={`Row ${y + 1} (clue ${puzzle.rows[y].join(' ') || '0'}), column ${x + 1} (clue ${puzzle.cols[x].join(' ') || '0'}): ${describe(shown[i])}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

interface CellViewProps {
  id: string;
  i: number;
  n: number;
  cell: Cell;
  wrong: boolean;
  pulse: boolean;
  cursor: boolean;
  label: string;
}

const CellView = memo(function CellView({ id, i, n, cell, wrong, pulse, cursor, label }: CellViewProps) {
  const x = i % n;
  const y = Math.floor(i / n);
  let cls = 'cell';
  if (x % 5 === 4 && x < n - 1) cls += ' r5';
  if (y % 5 === 4 && y < n - 1) cls += ' b5';
  if (cell.s === 1) cls += cell.by === 1 ? ' f1' : ' f0';
  else if (cell.s === 2) cls += ' x';
  if (wrong) cls += ' wrong';
  if (pulse) cls += ' pulse';
  if (cursor) cls += ' cursor';
  return <div id={id} role="gridcell" aria-label={label} className={cls} />;
});
