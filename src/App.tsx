import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from './auth/AuthGate';
import { Chat } from './components/Chat';
import { InviteBanner } from './components/InviteBanner';
import { newRandomPuzzle, puzzleFromGenerated, type Puzzle } from './game';
import { useHashRoute, type Route } from './hooks/useHashRoute';
import { usePlayer } from './hooks/usePlayer';
import { puzzleRoute } from './lib/routes';
import { findPuzzle, LIBRARY } from './puzzles/library';
import { Gallery } from './screens/Gallery';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { PlayRoute } from './screens/Play';
import { generate, randomSeed } from './solver';
import { useSync } from './sync/SyncProvider';

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
  const [localPlayer, setPlayer] = usePlayer();
  const auth = useAuth();
  // Signed in, you are whoever the guest list says; on a device-only setup, pick by hand.
  const player = auth.mode === 'cloud' ? auth.player : localPlayer;
  const { solved } = useSync();

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

  return (
    <main className="app">
      <InviteBanner go={go} currentPuzzleId={puzzle?.id ?? null} />
      {puzzle ? (
        <PlayRoute key={puzzle.id} puzzle={puzzle} player={player} onExit={() => go({ name: 'home' })} onNext={next} />
      ) : route.name === 'gallery' ? (
        <Gallery go={go} />
      ) : route.name === 'settings' ? (
        <Settings go={go} />
      ) : (
        <Home player={player} onPlayer={setPlayer} go={go} onRandom={playRandom} />
      )}
      <Chat puzzle={puzzle} go={go} />
    </main>
  );
}
