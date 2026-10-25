import { useCallback, useEffect, useMemo, useState } from 'react';
import { newRandomPuzzle, puzzleFromGenerated, type Puzzle } from './game';
import { useHashRoute, type Route } from './hooks/useHashRoute';
import { usePlayer } from './hooks/usePlayer';
import { findPuzzle, LIBRARY } from './puzzles/library';
import { Home } from './screens/Home';
import { Play, type SolvedRecord } from './screens/Play';
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
  // Phase 1 keeps solved puzzles in memory only. Phase 2 saves them.
  const [solved, setSolved] = useState<Map<string, SolvedRecord>>(new Map());

  const puzzle = useMemo(() => puzzleFor(route), [route]);

  // Unknown puzzle links fall back to the level list.
  useEffect(() => {
    if (route.name !== 'home' && !puzzle) go({ name: 'home' });
  }, [route, puzzle, go]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const onSolved = useCallback((r: SolvedRecord) => setSolved((m) => new Map(m).set(r.puzzleId, r)), []);

  const playRandom = useCallback(
    (n: number) => {
      const p = newRandomPuzzle(n, randomSeed);
      go({ name: 'random', n, seed: p.seed! });
    },
    [go],
  );

  const next = useCallback(() => {
    if (!puzzle) return;
    const idx = LIBRARY.findIndex((p) => p.id === puzzle.id);
    const order = [...LIBRARY.slice(idx + 1), ...LIBRARY.slice(0, Math.max(idx, 0))];
    const nx = order.find((p) => p.id !== puzzle.id && !solved.has(p.id));
    if (nx) go({ name: 'puzzle', id: nx.id });
    else playRandom(puzzle.n);
  }, [puzzle, solved, go, playRandom]);

  return (
    <main className="app">
      {puzzle ? (
        <Play key={puzzle.id} puzzle={puzzle} player={player} onExit={() => go({ name: 'home' })} onNext={next} onSolved={onSolved} />
      ) : (
        <Home player={player} onPlayer={setPlayer} solved={solved} onPlay={(id) => go({ name: 'puzzle', id })} onRandom={playRandom} />
      )}
    </main>
  );
}
