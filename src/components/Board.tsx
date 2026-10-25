import { memo, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ruleChange, satisfiedLines, strokeRule, type Cell, type Change, type Player, type Puzzle, type Stroke, type StrokeRule, type Tool } from '../game';

interface BoardProps {
  puzzle: Puzzle;
  cells: Cell[];
  player: Player;
  tool: Tool;
  cs: number;
  disabled?: boolean;
  /** Cells to outline as mistakes (after Check). */
  wrong?: ReadonlySet<number>;
  /** Cells to pulse (partner's recent moves, Phase 4). */
  pulse?: ReadonlySet<number>;
  onStroke: (stroke: Stroke) => void;
}

interface Drag {
  pointerId: number;
  rule: StrokeRule;
  start: number;
  axis: 'row' | 'col' | null;
  changes: Map<number, Change>;
}

const BORDER = 2;

export function Board({ puzzle, cells, player, tool, cs, disabled, wrong, pulse, onStroke }: BoardProps) {
  const { n } = puzzle;
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // Cells touched by the stroke in progress, shown before the stroke is committed.
  const [preview, setPreview] = useState<Map<number, Change> | null>(null);

  const shown = useMemo(() => {
    if (!preview) return cells;
    const out = cells.slice();
    preview.forEach((c) => (out[c.i] = c.next));
    return out;
  }, [cells, preview]);

  const sat = useMemo(() => satisfiedLines(puzzle, shown), [puzzle, shown]);

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
    if (c) d.changes.set(i, c);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    const i = indexAt(e);
    if (i < 0) return;
    e.preventDefault();
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

  const style = { '--cs': `${cs}px` } as CSSProperties;
  const track = { gridTemplateColumns: `repeat(${n}, var(--cs))` };

  return (
    <div className="board" style={style}>
      <div className="corner" />
      <div className="cols" style={track}>
        {puzzle.cols.map((c, x) => (
          <div key={x} className={sat.cols[x] ? 'cc ok' : 'cc'}>
            {(c.length ? c : [0]).map((v, k) => (
              <span key={k}>{v}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="rowsc">
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
        className="cells"
        style={track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(e) => e.preventDefault()}
      >
        {shown.map((c, i) => (
          <CellView key={i} i={i} n={n} cell={c} wrong={!!wrong?.has(i)} pulse={!!pulse?.has(i)} />
        ))}
      </div>
    </div>
  );
}

const CellView = memo(function CellView({ i, n, cell, wrong, pulse }: { i: number; n: number; cell: Cell; wrong: boolean; pulse: boolean }) {
  const x = i % n;
  const y = Math.floor(i / n);
  let cls = 'cell';
  if (x % 5 === 4 && x < n - 1) cls += ' r5';
  if (y % 5 === 4 && y < n - 1) cls += ' b5';
  if (cell.s === 1) cls += cell.by === 1 ? ' f1' : ' f0';
  else if (cell.s === 2) cls += ' x';
  if (wrong) cls += ' wrong';
  if (pulse) cls += ' pulse';
  return <div className={cls} />;
});
