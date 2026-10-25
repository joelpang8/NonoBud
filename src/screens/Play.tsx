import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { WinDialog } from '../components/WinDialog';
import { countBy, gameReducer, initGame, mistakes, ownerString, type Player, type Puzzle, type Stroke, type Tool } from '../game';
import { useActiveTimer } from '../hooks/useActiveTimer';
import { useCellSize } from '../hooks/useCellSize';
import { formatTime } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { difficulty } from '../solver';

export interface SolvedRecord {
  puzzleId: string;
  name: string;
  n: number;
  seconds: number;
  owners: string;
  together: boolean;
  seed?: number;
}

interface PlayProps {
  puzzle: Puzzle;
  player: Player;
  onExit: () => void;
  onNext: () => void;
  onSolved: (r: SolvedRecord) => void;
}

const WRONG_MS = 1800;
const TOAST_MS = 2400;

export function Play({ puzzle, player, onExit, onNext, onSolved }: PlayProps) {
  const [game, dispatch] = useReducer(gameReducer, puzzle, (p) => initGame(p));
  const [tool, setTool] = useState<Tool>('fill');
  const [zoomed, setZoomed] = useState(false);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState('');
  const [showWin, setShowWin] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const seconds = useActiveTimer(!game.solved);
  const { cs, canZoom } = useCellSize(stageRef, puzzle, zoomed);

  const say = useCallback((msg: string) => setToast(msg), []);
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

  // Report a win exactly once.
  const reported = useRef(false);
  useEffect(() => {
    if (!game.solved || reported.current) return;
    reported.current = true;
    const [a, b] = countBy(game.cells);
    onSolved({ puzzleId: puzzle.id, name: puzzle.name, n: puzzle.n, seconds, owners: ownerString(game.cells), together: a > 0 && b > 0, seed: puzzle.seed });
    setShowWin(true);
  }, [game.solved, game.cells, puzzle, seconds, onSolved]);

  const onStroke = useCallback((stroke: Stroke) => dispatch({ type: 'stroke', stroke }), []);

  const check = () => {
    const bad = mistakes(puzzle, game.cells);
    if (!bad.length) return say('No mistakes so far.');
    setWrong(new Set(bad));
    say(`${bad.length} ${bad.length === 1 ? 'cell is' : 'cells are'} wrong.`);
  };
  const hint = () => {
    const before = game.cells;
    dispatch({ type: 'hint', by: player });
    // The reducer is pure, so check the outcome against the same rule it uses.
    const open = before.some((c, i) => puzzle.solution[i] === 1 && c.s !== 1);
    say(open ? 'Filled one cell for you.' : 'Nothing left to fill. Remove any wrong cells.');
  };
  const clear = () => {
    if (!game.cells.some((c) => c.s !== 0)) return;
    dispatch({ type: 'clear', by: player });
    say('Cleared. Undo brings it back.');
  };

  const [a, b] = countBy(game.cells);

  return (
    <>
      <div className="top">
        <button type="button" className="back" onClick={onExit}>
          ‹ Levels
        </button>
        <div className="ttl">
          {/* Picture names are spoilers, so they stay hidden until solved (random puzzles have no picture). */}
          <h1>{game.solved || puzzle.seed !== undefined ? puzzle.name : 'Unsolved'}</h1>
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
          <button type="button" aria-pressed={tool === 'fill'} onClick={() => setTool('fill')}>
            Fill
          </button>
          <button type="button" aria-pressed={tool === 'x'} onClick={() => setTool('x')}>
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

      <div className="acts">
        <button type="button" disabled={!game.undo.length || game.solved} onClick={() => dispatch({ type: 'undo', by: player })}>
          Undo
        </button>
        <button type="button" disabled={game.solved} onClick={check}>
          Check
        </button>
        <button type="button" disabled={game.solved} onClick={hint}>
          Hint
        </button>
        <button type="button" disabled={game.solved} onClick={clear}>
          Start over
        </button>
      </div>
      <p className="toast" aria-live="polite">
        {toast}
      </p>

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
