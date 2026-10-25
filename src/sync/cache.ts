import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { CachedBoard, Op, SolvedRecord } from './types';

export interface QueuedOp {
  key: number;
  op: Op;
}

/** The device copy: a fast cache of boards and solves, plus the outbox of unsent work. */
export interface Cache {
  load(): Promise<{ boards: CachedBoard[]; solved: SolvedRecord[] }>;
  putBoard(b: CachedBoard): Promise<void>;
  putSolved(r: SolvedRecord): Promise<void>;
  /**
   * Add work to the outbox. Consecutive moves for the same board and round are
   * merged into one entry (newest move per cell) when `canMerge()` says it's safe,
   * i.e. the outbox isn't being sent at that moment.
   */
  enqueue(op: Op, canMerge: () => boolean): Promise<void>;
  queued(): Promise<QueuedOp[]>;
  dequeue(keys: number[]): Promise<void>;
}

/** Merge b into a when both are moves for the same board and round. */
export function mergeOps(a: Op, b: Op): Op | null {
  if (a.kind !== 'moves' || b.kind !== 'moves' || a.puzzleId !== b.puzzleId || a.round !== b.round) return null;
  const byCell = new Map(a.moves.map((m) => [m.i, m]));
  for (const m of b.moves) {
    const old = byCell.get(m.i);
    if (!old || m.v > old.v) byCell.set(m.i, m);
  }
  return { ...a, seconds: Math.max(a.seconds, b.seconds), moves: [...byCell.values()] };
}

// ---------------------------------------------------------------------------

interface SchemaV2 extends DBSchema {
  boards: { key: string; value: CachedBoard };
  solved: { key: string; value: SolvedRecord };
  ops: { key: number; value: Op };
}

/** Phase 2 stored boards without rounds or clock values. */
interface PhaseTwoBoard {
  puzzleId: string;
  n: number;
  seed?: number;
  cells: string;
  seconds: number;
  solved: boolean;
  updatedAt: number;
}

const DB_VERSION = 2;

export function createIndexedDbCache(name = 'cellmates'): Cache {
  let db: Promise<IDBPDatabase<SchemaV2>> | null = null;
  const open = () =>
    (db ??= openDB<SchemaV2>(name, DB_VERSION, {
      async upgrade(d, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          d.createObjectStore('boards', { keyPath: 'puzzleId' });
          d.createObjectStore('solved', { keyPath: 'puzzleId' });
        }
        d.createObjectStore('ops', { autoIncrement: true });
        if (oldVersion === 1) await upgradeFromPhaseTwo(tx);
      },
    }));

  return {
    async load() {
      const d = await open();
      const [boards, solved] = await Promise.all([d.getAll('boards'), d.getAll('solved')]);
      return { boards, solved };
    },
    async putBoard(b) {
      await (await open()).put('boards', b);
    },
    async putSolved(r) {
      await (await open()).put('solved', r);
    },
    async enqueue(op, canMerge) {
      const tx = (await open()).transaction('ops', 'readwrite');
      const last = await tx.store.openCursor(null, 'prev');
      const merged = last && canMerge() ? mergeOps(last.value, op) : null;
      if (merged && last) await last.update(merged);
      else await tx.store.add(op);
      await tx.done;
    },
    async queued() {
      const tx = (await open()).transaction('ops');
      const out: QueuedOp[] = [];
      for (let c = await tx.store.openCursor(); c; c = await c.continue()) out.push({ key: c.key, op: c.value });
      return out;
    },
    async dequeue(keys) {
      const tx = (await open()).transaction('ops', 'readwrite');
      await Promise.all(keys.map((k) => tx.store.delete(k)));
      await tx.done;
    },
  };
}

/**
 * Carry Phase 2 progress forward: give old boards clock values and queue them
 * (and old solves) for upload, so they reach Supabase on first sign-in.
 */
async function upgradeFromPhaseTwo(tx: IDBPTransaction<SchemaV2, ('boards' | 'solved' | 'ops')[], 'versionchange'>): Promise<void> {
  const base = Date.now() * 1000;
  const boards = tx.objectStore('boards');
  const ops = tx.objectStore('ops');
  const old = (await boards.getAll()) as unknown as PhaseTwoBoard[];
  for (const b of old) {
    const vers = [...b.cells].map((ch, i) => (ch === '.' ? 0 : base + i));
    const upgraded: CachedBoard = { ...b, round: 0, vers };
    await boards.put(upgraded);
    const moves = [...b.cells].flatMap((ch, i) =>
      ch === '.' ? [] : [{ i, s: ch === 'A' || ch === 'B' ? 1 : 2, o: ch === 'B' || ch === 'y' ? 1 : 0, v: vers[i] } as const],
    );
    await ops.add({ kind: 'moves', puzzleId: b.puzzleId, n: b.n, seed: b.seed, round: 0, seconds: b.seconds, moves } satisfies Op);
  }
  const solved = await tx.objectStore('solved').getAll();
  for (const r of solved) await ops.add({ kind: 'solve', puzzleId: r.puzzleId, round: 0, record: r } satisfies Op);
}

// ---------------------------------------------------------------------------

/** In-memory cache for tests, or when the browser blocks storage. Nothing survives a reload. */
export function createMemoryCache(): Cache {
  const boards = new Map<string, CachedBoard>();
  const solved = new Map<string, SolvedRecord>();
  const ops = new Map<number, Op>();
  let nextKey = 1;
  const clone = <T,>(v: T): T => structuredClone(v);
  return {
    async load() {
      return { boards: [...boards.values()].map(clone), solved: [...solved.values()].map(clone) };
    },
    async putBoard(b) {
      boards.set(b.puzzleId, clone(b));
    },
    async putSolved(r) {
      solved.set(r.puzzleId, clone(r));
    },
    async enqueue(op, canMerge) {
      const lastKey = [...ops.keys()].pop();
      const merged = lastKey !== undefined && canMerge() ? mergeOps(ops.get(lastKey)!, op) : null;
      if (merged && lastKey !== undefined) ops.set(lastKey, merged);
      else ops.set(nextKey++, clone(op));
    },
    async queued() {
      return [...ops.entries()].map(([key, op]) => ({ key, op: clone(op) }));
    },
    async dequeue(keys) {
      for (const k of keys) ops.delete(k);
    },
  };
}
