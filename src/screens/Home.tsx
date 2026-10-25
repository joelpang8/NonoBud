import { Logo } from '../components/Logo';
import { Thumb } from '../components/Thumb';
import type { Player } from '../game';
import { formatTime } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { LIBRARY, SIZES, type Size } from '../puzzles/library';
import { difficulty } from '../solver';
import type { SolvedRecord } from './Play';

const SUBTITLES: Record<Size, string> = {
  5: 'A few minutes',
  10: 'About fifteen minutes',
  15: 'Settle in for a while',
  20: 'A long evening',
};

interface HomeProps {
  player: Player;
  onPlayer: (p: Player) => void;
  solved: ReadonlyMap<string, SolvedRecord>;
  onPlay: (id: string) => void;
  onRandom: (n: number) => void;
}

export function Home({ player, onPlayer, solved, onPlay, onRandom }: HomeProps) {
  const randoms = [...solved.values()].filter((r) => r.seed !== undefined);
  return (
    <>
      <div className="brand">
        <Logo />
        <h1>Cellmates</h1>
      </div>
      <p className="lede">Nonograms for two. Solve side by side on the same grid, or take one each.</p>
      <div className="home-meta">
        <p className="count">{solved.size} solved so far</p>
        <div className="seg" role="group" aria-label="Who is playing on this device">
          {([0, 1] as const).map((p) => (
            <button key={p} type="button" aria-pressed={player === p} onClick={() => onPlayer(p)}>
              {PLAYER_NAMES[p]}
            </button>
          ))}
        </div>
      </div>

      {SIZES.map((n) => (
        <section className="sec" key={n} aria-labelledby={`sec-${n}`}>
          <div className="sec-h">
            <h2 id={`sec-${n}`}>
              {n}×{n}
            </h2>
            <span>{SUBTITLES[n]}</span>
          </div>
          <div className="cards">
            {LIBRARY.filter((p) => p.n === n).map((p) => {
              const d = solved.get(p.id);
              return (
                <button type="button" className="card" key={p.id} onClick={() => onPlay(p.id)}>
                  <Thumb n={p.n} owners={d?.owners} />
                  <span>
                    <b>{d ? p.name : 'Unsolved'}</b>
                    <small>
                      {d
                        ? `Solved in ${formatTime(d.seconds)}${d.together ? ' together' : ''}`
                        : difficulty({ solved: p.lineSolvable, passes: p.passes }, p.n)}
                    </small>
                  </span>
                </button>
              );
            })}
            {randoms
              .filter((r) => r.n === n)
              .map((r) => (
                <div className="card" key={r.puzzleId}>
                  <Thumb n={r.n} owners={r.owners} />
                  <span>
                    <b>{r.name}</b>
                    <small>
                      Solved in {formatTime(r.seconds)}
                      {r.together ? ' together' : ''}
                    </small>
                  </span>
                </div>
              ))}
            <button type="button" className="card new" onClick={() => onRandom(n)}>
              <b>New random puzzle</b>
              <small>Checked so it can be solved by logic</small>
            </button>
          </div>
        </section>
      ))}
    </>
  );
}
