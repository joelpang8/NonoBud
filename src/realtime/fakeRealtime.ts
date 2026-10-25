import type { BoardMeta, RemoteCell } from '../sync';
import type { BoardHandlers, Invite, PresenceHandlers, PresenceInfo, PresenceSession, Realtime } from './types';

/**
 * In-memory stand-in for Supabase Realtime, for tests. The fake server calls
 * publishCells/publishBoard when rows change, like Postgres replication does.
 */
export class FakeHub {
  private boards = new Map<string, Set<BoardHandlers>>();
  private members = new Map<PresenceHandlers, PresenceInfo>();
  /** When false, nothing is delivered (simulates a dropped connection). */
  connected = true;

  publishCells(puzzleId: string, round: number, cells: RemoteCell[]): void {
    if (this.connected) this.boards.get(puzzleId)?.forEach((h) => h.onCells(round, cells));
  }

  publishBoard(meta: BoardMeta): void {
    if (this.connected) this.boards.get(meta.puzzleId)?.forEach((h) => h.onBoard(meta));
  }

  /** Simulate the connection coming back: every watcher re-syncs. */
  reconnect(): void {
    this.connected = true;
    this.boards.forEach((set) => set.forEach((h) => h.onConnected()));
  }

  client(): Realtime {
    return {
      watchBoard: (puzzleId, h) => {
        let set = this.boards.get(puzzleId);
        if (!set) this.boards.set(puzzleId, (set = new Set()));
        set.add(h);
        h.onConnected();
        return () => set!.delete(h);
      },
      joinPresence: (me, h): PresenceSession => {
        this.members.set(h, me);
        const sync = () => {
          const peers = [...this.members.values()];
          this.members.forEach((_, m) => m.onPeers(peers));
        };
        h.onConnected(true);
        sync();
        return {
          set: (info) => {
            this.members.set(h, info);
            sync();
          },
          invite: (inv: Invite) => this.members.forEach((_, m) => m !== h && m.onInvite(inv)),
          leave: () => {
            this.members.delete(h);
            sync();
          },
        };
      },
    };
  }
}
