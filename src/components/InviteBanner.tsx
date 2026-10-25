import type { Route } from '../hooks/useHashRoute';
import { PLAYER_NAMES } from '../lib/players';
import { puzzleRoute } from '../lib/routes';
import { useLive } from '../realtime/LiveProvider';

/** Shown on any screen when the other person invites you to a puzzle. */
export function InviteBanner({ go, currentPuzzleId }: { go: (r: Route) => void; currentPuzzleId: string | null }) {
  const { incoming, dismissInvite } = useLive();
  if (!incoming || incoming.puzzleId === currentPuzzleId) return null;
  const join = () => {
    dismissInvite();
    go(puzzleRoute({ puzzleId: incoming.puzzleId, n: incoming.n, seed: incoming.seed ?? undefined }));
  };
  return (
    <div className="banner invite" role="alert">
      <span>
        <b>{PLAYER_NAMES[incoming.from]}</b> invited you to a {incoming.n}×{incoming.n} puzzle.
      </span>
      <span className="banner-acts">
        <button type="button" className="pri-btn" onClick={join}>
          Join
        </button>
        <button type="button" className="link-btn" onClick={dismissInvite}>
          Not now
        </button>
      </span>
    </div>
  );
}

/** On the level list: what the other person is doing right now, with a way to jump in. */
export function PartnerBanner({ go }: { go: (r: Route) => void }) {
  const { partner } = useLive();
  if (!partner) return null;
  const name = PLAYER_NAMES[partner.player];
  if (!partner.puzzleId || !partner.n) {
    return (
      <div className="banner">
        <span>
          <i className="dot" style={{ background: `var(--p${partner.player})` }} aria-hidden="true" />
          {name} is online, browsing puzzles.
        </span>
      </div>
    );
  }
  return (
    <div className="banner">
      <span>
        <i className="dot" style={{ background: `var(--p${partner.player})` }} aria-hidden="true" />
        {name} is playing a {partner.n}×{partner.n} puzzle.
      </span>
      <button
        type="button"
        className="pri-btn"
        onClick={() => go(puzzleRoute({ puzzleId: partner.puzzleId!, n: partner.n!, seed: partner.seed ?? undefined }))}
      >
        Join
      </button>
    </div>
  );
}
