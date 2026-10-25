import type { SupabaseClient } from '@supabase/supabase-js';
import type { CellState, Player } from '../game';
import { OfflineError, type BoardMeta, type Op, type Remote, type RemoteCell, type SolvedRecord } from './types';

interface BoardRow {
  puzzle_id: string;
  n: number;
  seed: number | null;
  round: number;
  seconds: number;
  solved: boolean;
  updated_at: string;
}

interface SolveRow {
  puzzle_id: string;
  name: string;
  n: number;
  seed: number | null;
  seconds: number;
  owners: string;
  together: boolean;
  solved_at: string;
}

const toMeta = (r: BoardRow): BoardMeta => ({
  puzzleId: r.puzzle_id,
  n: r.n,
  seed: r.seed ?? undefined,
  round: r.round,
  seconds: r.seconds,
  solved: r.solved,
  updatedAt: Date.parse(r.updated_at),
});

const toSolved = (r: SolveRow): SolvedRecord => ({
  puzzleId: r.puzzle_id,
  name: r.name,
  n: r.n,
  seed: r.seed ?? undefined,
  seconds: r.seconds,
  owners: r.owners,
  together: r.together,
  solvedAt: Date.parse(r.solved_at),
});

/** Supabase reports "couldn't reach the server" as an error without a database code. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (!res.error) return res.data;
  const { message, code } = res.error;
  if (!code || /fetch|network|load failed|timed? ?out/i.test(message)) throw new OfflineError(message);
  throw new Error(message);
}

/** Wrap a request so a thrown network failure becomes an OfflineError too. */
async function call<T>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  try {
    return check(await p);
  } catch (e) {
    if (e instanceof TypeError) throw new OfflineError(e.message);
    throw e;
  }
}

export function createSupabaseRemote(sb: SupabaseClient): Remote {
  return {
    async listBoards() {
      const rows = await call(sb.from('boards').select('puzzle_id, n, seed, round, seconds, solved, updated_at'));
      return (rows as BoardRow[]).map(toMeta);
    },

    async listSolves() {
      const rows = await call(sb.from('solves').select('puzzle_id, name, n, seed, seconds, owners, together, solved_at'));
      return (rows as SolveRow[]).map(toSolved);
    },

    async getBoard(puzzleId) {
      const [board, cells] = await Promise.all([
        call(sb.from('boards').select('puzzle_id, n, seed, round, seconds, solved, updated_at').eq('puzzle_id', puzzleId).maybeSingle()),
        call(sb.from('board_cells').select('idx, state, owner, ver').eq('puzzle_id', puzzleId)),
      ]);
      return {
        meta: board ? toMeta(board as BoardRow) : null,
        cells: (cells as { idx: number; state: number; owner: number | null; ver: number }[]).map(
          (c): RemoteCell => ({ idx: c.idx, state: c.state as CellState, owner: c.owner as Player | null, ver: Number(c.ver) }),
        ),
      };
    },

    async applyMoves(op: Extract<Op, { kind: 'moves' }>) {
      const round = await call(
        sb.rpc('apply_moves', {
          p_puzzle_id: op.puzzleId,
          p_n: op.n,
          p_seed: op.seed ?? null,
          p_round: op.round,
          p_seconds: Math.floor(op.seconds),
          p_moves: op.moves,
        }),
      );
      return Number(round);
    },

    async recordSolve(op: Extract<Op, { kind: 'solve' }>) {
      const r = op.record;
      await call(
        sb.rpc('record_solve', {
          p_puzzle_id: r.puzzleId,
          p_round: op.round,
          p_name: r.name,
          p_n: r.n,
          p_seed: r.seed ?? null,
          p_seconds: Math.floor(r.seconds),
          p_owners: r.owners,
          p_together: r.together,
        }),
      );
    },

    async resetBoard(op: Extract<Op, { kind: 'reset' }>) {
      return Number(await call(sb.rpc('reset_board', { p_puzzle_id: op.puzzleId, p_round: op.fromRound })));
    },
  };
}
