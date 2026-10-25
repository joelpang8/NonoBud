import type { BoardMeta, Op, Remote, RemoteCell, SolvedRecord } from './types';
import { OfflineError } from './types';
import type { Player } from '../game';

interface ServerCell extends RemoteCell {
  writer: Player;
}

/**
 * An in-memory server with the same rules as the SQL migration (last write
 * wins per cell, ties by player, rounds for Play again). Several engines can
 * share one, each through its own client() with its own player and network switch.
 */
export class FakeServer {
  boards = new Map<string, BoardMeta>();
  cells = new Map<string, Map<number, ServerCell>>();
  solves = new Map<string, SolvedRecord>();
  calls = 0;

  client(player: Player): FakeClient {
    return new FakeClient(this, player);
  }
}

export class FakeClient implements Remote {
  online = true;
  /** Hold requests until release() is called, to simulate slow or reordered delivery. */
  private held: (() => void)[] | null = null;

  constructor(
    private server: FakeServer,
    private player: Player,
  ) {}

  hold(): void {
    this.held = [];
  }

  release(): void {
    const h = this.held ?? [];
    this.held = null;
    h.forEach((fn) => fn());
  }

  private async call<T>(fn: () => T): Promise<T> {
    if (this.held) await new Promise<void>((r) => this.held!.push(r));
    if (!this.online) throw new OfflineError();
    this.server.calls++;
    return structuredClone(fn());
  }

  listBoards() {
    return this.call(() => [...this.server.boards.values()]);
  }

  listSolves() {
    return this.call(() => [...this.server.solves.values()]);
  }

  getBoard(puzzleId: string) {
    return this.call(() => ({
      meta: this.server.boards.get(puzzleId) ?? null,
      cells: [...(this.server.cells.get(puzzleId)?.values() ?? [])].map(({ idx, state, owner, ver }) => ({ idx, state, owner, ver })),
    }));
  }

  applyMoves(op: Extract<Op, { kind: 'moves' }>) {
    return this.call(() => {
      const s = this.server;
      let b = s.boards.get(op.puzzleId);
      if (!b) {
        b = { puzzleId: op.puzzleId, n: op.n, seed: op.seed, round: op.round, seconds: op.seconds, solved: false, updatedAt: Date.now() };
        s.boards.set(op.puzzleId, b);
        s.cells.set(op.puzzleId, new Map());
      } else if (b.round === op.round) {
        b.seconds = Math.max(b.seconds, op.seconds);
      }
      if (b.round !== op.round) return b.round;
      const cells = s.cells.get(op.puzzleId)!;
      for (const m of op.moves) {
        const cur = cells.get(m.i);
        if (!cur || m.v > cur.ver || (m.v === cur.ver && this.player > cur.writer)) {
          cells.set(m.i, { idx: m.i, state: m.s, owner: m.o, ver: m.v, writer: this.player });
        }
      }
      return b.round;
    });
  }

  recordSolve(op: Extract<Op, { kind: 'solve' }>) {
    return this.call(() => {
      const b = this.server.boards.get(op.puzzleId);
      if (b && b.round === op.round) b.solved = true;
      this.server.solves.set(op.puzzleId, op.record);
    });
  }

  resetBoard(op: Extract<Op, { kind: 'reset' }>) {
    return this.call(() => {
      const b = this.server.boards.get(op.puzzleId);
      if (!b) return 0;
      if (b.round === op.fromRound) {
        b.round++;
        b.seconds = 0;
        b.solved = false;
        this.server.cells.set(op.puzzleId, new Map());
      }
      return b.round;
    });
  }
}
