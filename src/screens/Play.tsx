import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { SyncBadge } from '../components/SyncBadge';
import { WinDialog } from '../components/WinDialog';
import {
  clearChanges,
  countBy,
  gameReducer,
  hintChange,
  initGame,
  mistakes,
  ownerString,
  undoChanges,
  type Change,
  type GameState,
  type Player,
  type Puzzle,
  type Stroke,
  type Tool,
} from '../game';
import { useActiveTimer } from '../hooks/useActiveTimer';
import { useCellSize } from '../hooks/useCellSize';
import { formatTime } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { difficulty } from '../solver';
import type { BoardDoc } from '../sync';
import { useEngine } from '../sync/SyncProvider';

interface PlayRouteProps {
  puzzle: Puzzle;
  player: Player;
  onExit: () => void;
  onNext: () => void;
}

/** Opens the shared board for a puzzle and restarts the screen when a new round begins. */
export function PlayRoute(props: PlayRouteProps) {
  const engine = useEngine();
  const [doc, setDoc] = useState<BoardDoc>(() => engine.open(props.puzzle));

  // Someone pressed "Play again" on another device.
  useEffect(() => engine.watch(props.puzzle.id, (e) => e.kind === 'reset' && setDoc(e.doc)), [engine, props.puzzle.id]);

  const replay = () => {
    const fresh = engine.reset(props.puzzle.id);
    if (fresh) setDoc(fresh);
  };

  return <Play key={doc.round} {...props} doc={doc} onReplay={replay} />;
}

interface PlayProps extends PlayRouteProps {
  doc: BoardDoc;
  onReplay: () => void;
}

const WRONG_MS = 1800;
const TOAST_MS = 2400;
const SAVE_TIME_EVERY_MS = 15_000;

function Play({ puzzle, player, doc, onExit, onNext, onReplay }: PlayProps) {
  const engine = useEngine();
  const [game, dispatch] = useReducer(gameReducer, null, (): GameState => initGame(puzzle, doc.cells.slice()));
  const [tool, setTool] = useState<Tool>('fill');
  const [zoomed, setZoomed] = useState(false);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState('');
  const [showWin, setShowWin] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const seconds = useActiveTimer(!game.solved, doc.seconds);
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

  // Moves from the partner or another device.
  useEffect(() => engine.watch(puzzle.id, (e) => e.kind === 'cells' && dispatch({ type: 'remote', changes: e.changes })), [engine, puzzle.id]);

  // ---------- making moves ----------
  /** Every move goes to the sync engine (saved and sent) and to the screen. */
  const play = useCallback(
    (stroke: Stroke) => {
      if (!stroke.changes.length) return;
      engine.applyLocal(puzzle.id, stroke.changes);
      dispatch({ type: 'local', stroke });
    },
    [engine, puzzle.id],
  );

  const undo = () => {
    const last = game.undo[game.undo.length - 1];
    if (!last) return;
    const changes: Change[] = undoChanges(game.cells, last);
    engine.applyLocal(puzzle.id, changes);
    dispatch({ type: 'undo', changes });
  };
  const check = () => {
    const bad = mistakes(puzzle, game.cells);
    if (!bad.length) return setToast('No mistakes so far.');
    setWrong(new Set(bad));
    setToast(`${bad.length} ${bad.length === 1 ? 'cell is' : 'cells are'} wrong.`);
  };
  const hint = () => {
    const c = hintChange(puzzle, game.cells, player);
    if (!c) return setToast('Nothing left to fill. Remove any wrong cells.');
    play({ by: player, changes: [c] });
    setToast('Filled one cell for you.');
  };
  const clear = () => {
    const changes = clearChanges(game.cells);
    if (!changes.length) return;
    play({ by: player, changes });
    setToast('Cleared. Undo brings it back.');
  };

  // ---------- time ----------
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  useEffect(() => {
    const save = () => engine.saveSeconds(puzzle.id, secondsRef.current, doc.round);
    const id = window.setInterval(save, SAVE_TIME_EVERY_MS);
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      save();
    };
  }, [engine, puzzle.id, doc.round]);

  // ---------- winning ----------
  // A board that was already solved when opened doesn't celebrate again.
  const reported = useRef(game.solved);
  useEffect(() => {
    if (!game.solved || reported.current) return;
    reported.current = true;
    const [a, b] = countBy(game.cells);
    engine.markSolved({
      puzzleId: puzzle.id,
      name: puzzle.name,
      n: puzzle.n,
      seconds,
      owners: ownerString(game.cells),
      together: a > 0 && b > 0,
      seed: puzzle.seed,
      solvedAt: Date.now(),
    });
    setShowWin(true);
  }, [game.solved, game.cells, puzzle, seconds, engine]);

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
        <Board puzzle={puzzle} cells={game.cells} player={player} tool={tool} cs={cs} disabled={game.solved} wrong={wrong} onStroke={play} />
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
          <button type="button" onClick={onReplay}>
            Play again
          </button>
          <button type="button" onClick={onNext}>
            Next puzzle
          </button>
        </div>
      ) : (
        <div className="acts">
          <button type="button" disabled={!game.undo.length} onClick={undo}>
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
      <SyncBadge />

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
