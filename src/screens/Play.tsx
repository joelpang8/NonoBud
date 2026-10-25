import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { WinDialog } from '../components/WinDialog';
import { decodeCells, encodeCells, useProgress, type SavedBoard } from '../data';
import { countBy, gameReducer, initGame, mistakes, ownerString, type GameState, type Player, type Puzzle, type Stroke, type Tool } from '../game';
import { useActiveTimer } from '../hooks/useActiveTimer';
import { useCellSize } from '../hooks/useCellSize';
import { formatTime } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { difficulty } from '../solver';

interface PlayProps {
  puzzle: Puzzle;
  player: Player;
  /** The saved board for this puzzle, if someone started it before. */
  initial?: SavedBoard;
  onExit: () => void;
  onNext: () => void;
  /** Throw away the finished board and start this puzzle fresh. */
  onReplay: () => void;
}

const WRONG_MS = 1800;
const TOAST_MS = 2400;
const SAVE_DELAY_MS = 400;

export function Play({ puzzle, player, initial, onExit, onNext, onReplay }: PlayProps) {
  const { saveBoard, markSolved, saveError } = useProgress();
  const [game, dispatch] = useReducer(gameReducer, null, (): GameState => initGame(puzzle, initial ? (decodeCells(initial.cells, puzzle.n) ?? undefined) : undefined));
  const [tool, setTool] = useState<Tool>('fill');
  const [zoomed, setZoomed] = useState(false);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState('');
  const [showWin, setShowWin] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const seconds = useActiveTimer(!game.solved, initial?.seconds ?? 0);
  const { cs, canZoom } = useCellSize(stageRef, puzzle, zoomed);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!wrong.size) return;
    const id = window.setTimeout(() => setWrong(new Set()), WRONG_MS);
    return () => window.clearTimeout(id);
  }, [wrong]);

  // ---------- saving ----------
  // The latest state, readable from timers and unmount without re-subscribing.
  const latest = useRef({ game, seconds });
  latest.current = { game, seconds };
  // Only boards someone has touched are saved, so just looking at a puzzle doesn't mark it "in progress".
  const started = useRef(!!initial);
  const discarded = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!started.current || discarded.current) return;
    const { game: g, seconds: s } = latest.current;
    saveBoard({ puzzleId: puzzle.id, n: puzzle.n, seed: puzzle.seed, cells: encodeCells(g.cells), seconds: s, solved: g.solved, updatedAt: Date.now() });
  }, [saveBoard, puzzle]);

  const firstCells = useRef(game.cells);
  useEffect(() => {
    if (game.cells === firstCells.current) return;
    started.current = true;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  }, [game.cells, flush]);

  // Save when leaving the screen or when the app goes to the background (phones may kill it there).
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  // ---------- winning ----------
  // A board that was already solved when opened doesn't celebrate again.
  const reported = useRef(game.solved);
  useEffect(() => {
    if (!game.solved || reported.current) return;
    reported.current = true;
    const [a, b] = countBy(game.cells);
    markSolved({
      puzzleId: puzzle.id,
      name: puzzle.name,
      n: puzzle.n,
      seconds,
      owners: ownerString(game.cells),
      together: a > 0 && b > 0,
      seed: puzzle.seed,
      solvedAt: Date.now(),
    });
    flush();
    setShowWin(true);
  }, [game.solved, game.cells, puzzle, seconds, markSolved, flush]);

  const onStroke = useCallback((stroke: Stroke) => dispatch({ type: 'stroke', stroke }), []);

  const check = () => {
    const bad = mistakes(puzzle, game.cells);
    if (!bad.length) return setToast('No mistakes so far.');
    setWrong(new Set(bad));
    setToast(`${bad.length} ${bad.length === 1 ? 'cell is' : 'cells are'} wrong.`);
  };
  const hint = () => {
    const open = game.cells.some((c, i) => puzzle.solution[i] === 1 && c.s !== 1);
    dispatch({ type: 'hint', by: player });
    setToast(open ? 'Filled one cell for you.' : 'Nothing left to fill. Remove any wrong cells.');
  };
  const clear = () => {
    if (!game.cells.some((c) => c.s !== 0)) return;
    dispatch({ type: 'clear', by: player });
    setToast('Cleared. Undo brings it back.');
  };
  const replay = () => {
    discarded.current = true;
    onReplay();
  };

  const [a, b] = countBy(game.cells);
  // Picture names are spoilers, so they stay hidden until solved (random puzzles have no picture).
  const title = game.solved || puzzle.seed !== undefined ? puzzle.name : 'Unsolved';

  return (
    <>
      <div className="top">
        <button type="button" className="back" onClick={onExit}>
          ‹ Levels
        </button>
        <div className="ttl">
          <h1>{title}</h1>
          <div className="m">
            <span>
              {puzzle.n}×{puzzle.n}
            </span>
            <span>{difficulty({ solved: puzzle.lineSolvable, passes: puzzle.passes }, puzzle.n)}</span>
          </div>
        </div>
        <div className="time" aria-label={`Time ${formatTime(seconds)}`}>
          {formatTime(seconds)}
        </div>
      </div>

      <div className="ctrls">
        <div className="seg" role="group" aria-label="Tool">
          <button type="button" aria-pressed={tool === 'fill'} onClick={() => setTool('fill')} disabled={game.solved}>
            Fill
          </button>
          <button type="button" aria-pressed={tool === 'x'} onClick={() => setTool('x')} disabled={game.solved}>
            Mark X
          </button>
        </div>
        {(canZoom || zoomed) && (
          <button type="button" className="zoom-btn" aria-pressed={zoomed} onClick={() => setZoomed((z) => !z)}>
            {zoomed ? 'Fit to screen' : 'Zoom in'}
          </button>
        )}
      </div>

      <div ref={stageRef} className={zoomed ? 'stage zoomed' : 'stage'}>
        <Board puzzle={puzzle} cells={game.cells} player={player} tool={tool} cs={cs} disabled={game.solved} wrong={wrong} onStroke={onStroke} />
      </div>

      <div className="legend">
        <span>
          <i style={{ background: 'var(--p0)' }} />
          {PLAYER_NAMES[0]} {a}
        </span>
        {(b > 0 || player === 1) && (
          <span>
            <i style={{ background: 'var(--p1)' }} />
            {PLAYER_NAMES[1]} {b}
          </span>
        )}
      </div>

      {game.solved ? (
        <div className="acts">
          <button type="button" onClick={replay}>
            Play again
          </button>
          <button type="button" onClick={onNext}>
            Next puzzle
          </button>
        </div>
      ) : (
        <div className="acts">
          <button type="button" disabled={!game.undo.length} onClick={() => dispatch({ type: 'undo', by: player })}>
            Undo
          </button>
          <button type="button" onClick={check}>
            Check
          </button>
          <button type="button" onClick={hint}>
            Hint
          </button>
          <button type="button" onClick={clear}>
            Start over
          </button>
        </div>
      )}
      <p className="toast" aria-live="polite">
        {game.solved && !showWin ? `Solved in ${formatTime(seconds)}.` : toast}
      </p>
      {saveError && <p className="note warn">{saveError}</p>}

      {showWin && (
        <WinDialog
          puzzle={puzzle}
          cells={game.cells}
          seconds={seconds}
          onLevels={onExit}
          onNext={() => {
            setShowWin(false);
            onNext();
          }}
        />
      )}
    </>
  );
}
