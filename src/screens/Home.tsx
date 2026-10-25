import { Logo } from '../components/Logo';
import { Thumb } from '../components/Thumb';
import { useAuth } from '../auth/AuthGate';
import { PartnerBanner } from '../components/InviteBanner';
import { SyncBadge } from '../components/SyncBadge';
import type { BoardMeta, SolvedRecord } from '../sync';
import { useSync } from '../sync/SyncProvider';
import type { Player, Puzzle } from '../game';
import type { Route } from '../hooks/useHashRoute';
import { formatTime } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { puzzleRoute } from '../lib/routes';
import { LIBRARY, SIZES, type Size } from '../puzzles/library';
import { difficulty } from '../solver';

const SUBTITLES: Record<Size, string> = {
  5: 'A few minutes',
  10: 'About fifteen minutes',
  15: 'Settle in for a while',
  20: 'A long evening',
};

interface HomeProps {
  player: Player;
  onPlayer: (p: Player) => void;
  go: (r: Route) => void;
  onRandom: (n: number) => void;
}

const solvedLine = (r: SolvedRecord) => `Solved in ${formatTime(r.seconds)}${r.together ? ' together' : ''}`;
const progressLine = (b: BoardMeta) => `In progress · ${formatTime(b.seconds)}`;

export function Home({ player, onPlayer, go, onRandom }: HomeProps) {
  const { boards, solved } = useSync();
  const auth = useAuth();

  // Random puzzles someone started or finished, newest first.
  type RandomCard = { id: string; n: number; seed?: number; at: number; label: string; owners?: string };
  const randoms: RandomCard[] = [
    ...[...boards.values()]
      .filter((b) => b.seed !== undefined && !b.solved && !solved.has(b.puzzleId))
      .map((b) => ({ id: b.puzzleId, n: b.n, seed: b.seed, at: b.updatedAt, label: progressLine(b) })),
    ...[...solved.values()]
      .filter((r) => r.seed !== undefined)
      .map((r) => ({ id: r.puzzleId, n: r.n, seed: r.seed, at: r.solvedAt, label: solvedLine(r), owners: r.owners })),
  ].sort((a, b) => b.at - a.at);

  const card = (p: Puzzle) => {
    const done = solved.get(p.id);
    const board = boards.get(p.id);
    const label = done ? solvedLine(done) : board && !board.solved ? progressLine(board) : difficulty({ solved: p.lineSolvable, passes: p.passes }, p.n);
    return (
      <button type="button" className="card" key={p.id} onClick={() => go({ name: 'puzzle', id: p.id })}>
        <Thumb n={p.n} owners={done?.owners} />
        <span>
          <b>{done ? p.name : 'Unsolved'}</b>
          <small>{label}</small>
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="brand">
        <Logo />
        <h1>Cellmates</h1>
        <button type="button" className="icon-btn" onClick={() => go({ name: 'settings' })} aria-label="Settings">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              transform="translate(-1 0)"
            />
          </svg>
        </button>
      </div>
      <p className="lede">Nonograms for two. Solve side by side on the same grid, or take one each.</p>
      <div className="home-meta">
        <button type="button" className="back" onClick={() => go({ name: 'gallery' })}>
          Gallery · {solved.size}
        </button>
        {auth.mode === 'local' ? (
          <div className="seg" role="group" aria-label="Who is playing on this device">
            {([0, 1] as const).map((p) => (
              <button key={p} type="button" aria-pressed={player === p} onClick={() => onPlayer(p)}>
                {PLAYER_NAMES[p]}
              </button>
            ))}
          </div>
        ) : (
          <div className="who">
            <i style={{ background: `var(--p${auth.player})` }} aria-hidden="true" />
            {PLAYER_NAMES[auth.player]}
          </div>
        )}
      </div>
      <SyncBadge />
      <PartnerBanner go={go} />

      {SIZES.map((n) => {
        const inSize = LIBRARY.filter((p) => p.n === n);
        const doneCount = inSize.filter((p) => solved.has(p.id)).length;
        return (
          <section className="sec" key={n} aria-labelledby={`sec-${n}`}>
            <div className="sec-h">
              <h2 id={`sec-${n}`}>
                {n}×{n}
              </h2>
              <span>
                {SUBTITLES[n]} · {doneCount} of {inSize.length} solved
              </span>
            </div>
            <div className="cards">
              {inSize.map(card)}
              {randoms
                .filter((r) => r.n === n)
                .map((r) => (
                  <button type="button" className="card" key={r.id} onClick={() => go(puzzleRoute({ puzzleId: r.id, n: r.n, seed: r.seed }))}>
                    <Thumb n={r.n} owners={r.owners} />
                    <span>
                      <b>Random</b>
                      <small>{r.label}</small>
                    </span>
                  </button>
                ))}
              <button type="button" className="card new" onClick={() => onRandom(n)}>
                <b>New random puzzle</b>
                <small>Checked so it can be solved by logic</small>
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}
