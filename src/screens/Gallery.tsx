import { Thumb } from '../components/Thumb';
import { useSync } from '../sync/SyncProvider';
import type { Route } from '../hooks/useHashRoute';
import { formatTime } from '../lib/format';
import { PLAYER_NAMES } from '../lib/players';
import { puzzleRoute } from '../lib/routes';

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Who solved it, from the picture: both of you, or just one. */
function solvers(owners: string): string {
  const joel = owners.includes('0');
  const ysl = owners.includes('1');
  if (joel && ysl) return 'Together';
  return PLAYER_NAMES[ysl ? 1 : 0];
}

export function Gallery({ go }: { go: (r: Route) => void }) {
  const { solved } = useSync();
  const records = [...solved.values()].sort((a, b) => b.solvedAt - a.solvedAt);

  return (
    <>
      <div className="top">
        <button type="button" className="back" onClick={() => go({ name: 'home' })}>
          ‹ Levels
        </button>
        <div className="ttl">
          <h1>Gallery</h1>
          <div className="m">
            <span>
              {records.length} finished {records.length === 1 ? 'picture' : 'pictures'}
            </span>
          </div>
        </div>
      </div>

      {records.length ? (
        <>
          <div className="legend">
            <span>
              <i style={{ background: 'var(--p0)' }} />
              {PLAYER_NAMES[0]}
            </span>
            <span>
              <i style={{ background: 'var(--p1)' }} />
              {PLAYER_NAMES[1]}
            </span>
          </div>
          <div className="cards gallery">
            {records.map((r) => (
              <button type="button" className="card" key={r.puzzleId} onClick={() => go(puzzleRoute(r))}>
                <Thumb n={r.n} owners={r.owners} label={`${r.name}, colored by who filled each cell`} />
                <span>
                  <b>{r.name}</b>
                  <small>
                    {r.n}×{r.n} · {formatTime(r.seconds)} · {solvers(r.owners)}
                  </small>
                  <small className="date">{DATE.format(r.solvedAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <h2>Nothing here yet</h2>
          <p>Finish a puzzle and its picture lands here, colored by who filled each cell.</p>
          <button type="button" className="pri-btn" onClick={() => go({ name: 'home' })}>
            Pick a puzzle
          </button>
        </div>
      )}
    </>
  );
}
