import { useCallback, useEffect, useMemo, useState } from 'react';
import { Logo } from './components/Logo';
import { useProgress } from './data';
import { newRandomPuzzle, puzzleFromGenerated, type Puzzle } from './game';
import { useHashRoute, type Route } from './hooks/useHashRoute';
import { usePlayer } from './hooks/usePlayer';
import { puzzleRoute } from './lib/routes';
import { findPuzzle, LIBRARY } from './puzzles/library';
import { Gallery } from './screens/Gallery';
import { Home } from './screens/Home';
import { Play } from './screens/Play';
import { generate, randomSeed } from './solver';

function puzzleFor(route: Route): Puzzle | null {
  if (route.name === 'puzzle') return findPuzzle(route.id) ?? null;
  if (route.name === 'random') {
    const g = generate(route.n, route.seed, 1);
    return g ? puzzleFromGenerated(g) : null;
  }
  return null;
}

export default function App() {
  const [route, go] = useHashRoute();
  const [player, setPlayer] = usePlayer();
  const { status, boards, solved, deleteBoard } = useProgress();
  // Bumped by "Play again" to start the same puzzle on a fresh board.
  const [round, setRound] = useState(0);

  const puzzle = useMemo(() => puzzleFor(route), [route]);

  // Unknown puzzle links fall back to the level list.
  useEffect(() => {
    if ((route.name === 'puzzle' || route.name === 'random') && !puzzle) go({ name: 'home' });
  }, [route, puzzle, go]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const playRandom = useCallback(
    (n: number) => {
      const p = newRandomPuzzle(n, randomSeed);
      go({ name: 'random', n, seed: p.seed! });
    },
    [go],
  );

  // Next unsolved library puzzle after this one, or a fresh random puzzle of the same size.
  const next = useCallback(() => {
    if (!puzzle) return;
    const idx = LIBRARY.findIndex((p) => p.id === puzzle.id);
    const order = [...LIBRARY.slice(idx + 1), ...LIBRARY.slice(0, Math.max(idx, 0))];
    const nx = order.find((p) => p.id !== puzzle.id && !solved.has(p.id));
    if (nx) go(puzzleRoute({ puzzleId: nx.id, n: nx.n }));
    else playRandom(puzzle.n);
  }, [puzzle, solved, go, playRandom]);

  if (status === 'loading') {
    return (
      <main className="app loading" aria-busy="true">
        <Logo />
        <p>Loading your puzzles…</p>
      </main>
    );
  }

  return (
    <main className="app">
      {status === 'unsaved' && (
        <p className="note warn">This browser is blocking storage, so progress won't be kept after you close the app.</p>
      )}
      {puzzle ? (
        <Play
          key={`${puzzle.id}:${round}`}
          puzzle={puzzle}
          player={player}
          initial={boards.get(puzzle.id)}
          onExit={() => go({ name: 'home' })}
          onNext={next}
          onReplay={() => {
            deleteBoard(puzzle.id);
            setRound((r) => r + 1);
          }}
        />
      ) : route.name === 'gallery' ? (
        <Gallery go={go} />
      ) : (
        <Home player={player} onPlayer={setPlayer} go={go} onRandom={playRandom} />
      )}
    </main>
  );
}
