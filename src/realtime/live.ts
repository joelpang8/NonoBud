import type { SyncEngine } from '../sync';
import type { Realtime } from './types';

/**
 * Feed live updates for one open board into the sync engine. On every
 * (re)connect the whole board is fetched once, so anything that happened while
 * the connection was down is caught up; after that, single changes stream in.
 * Out-of-order or duplicate updates are harmless: the engine keeps the newest
 * value per cell.
 */
export function watchLive(engine: SyncEngine, rt: Realtime, puzzleId: string): () => void {
  return rt.watchBoard(puzzleId, {
    onCells: (round, cells) => engine.receiveCells(puzzleId, round, cells),
    onBoard: (meta) => engine.receiveBoard(meta),
    onConnected: () => void engine.pull(puzzleId),
  });
}
