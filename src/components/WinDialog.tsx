import { useEffect, useRef } from 'react';
import { countBy, ownerString, type Cell, type Puzzle } from '../game';
import { formatTime, pct } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { Thumb } from './Thumb';

interface WinDialogProps {
  puzzle: Puzzle;
  cells: Cell[];
  seconds: number;
  onLevels: () => void;
  onNext: () => void;
}

export function WinDialog({ puzzle, cells, seconds, onLevels, onNext }: WinDialogProps) {
  const [a, b] = countBy(cells);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus();
  }, []);

  const split =
    a && b
      ? `${PLAYER_NAMES[0]} filled ${pct(a, a + b)}%. ${PLAYER_NAMES[1]} filled ${pct(b, a + b)}%.`
      : `Solved by ${PLAYER_NAMES[b ? 1 : 0]}.`;

  return (
    <div className="win">
      <div className="win-card" role="dialog" aria-modal="true" aria-labelledby="win-title">
        <Thumb n={puzzle.n} owners={ownerString(cells)} label={`Finished picture: ${puzzle.name}`} />
        <h2 id="win-title">{puzzle.name} is solved</h2>
        <p>Finished in {formatTime(seconds)}.</p>
        <p>{split}</p>
        <div className="row">
          <button type="button" onClick={onLevels}>
            Levels
          </button>
          <button type="button" className="pri" ref={nextRef} onClick={onNext}>
            Next puzzle
          </button>
        </div>
      </div>
    </div>
  );
}
