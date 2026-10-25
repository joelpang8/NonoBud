import { emptyBoard, sameCell, type Cell, type Change, type Puzzle } from '../game';
import type { Cache } from './cache';
import { Clock } from './clock';
import { decodeCells, encodeCells } from './encode';
import { OfflineError, type BoardDoc, type BoardMeta, type CachedBoard, type Op, type Remote, type RemoteCell, type SolvedRecord, type SyncStatus } from './types';

/** What the screens read. A new object every time something changes. */
export interface SyncSnapshot {
  status: SyncStatus;
  /** Moves and other work saved on this device but not yet on the server. */
  pending: number;
  boards: ReadonlyMap<string, BoardMeta>;
  solved: ReadonlyMap<string, SolvedRecord>;
  /** Plain-language problem, if the last attempt to sync failed for a reason other than being offline. */
  error: string | null;
}

/** Something changed on an open board because of the other player or another device. */
export type BoardEvent = { kind: 'cells'; changes: Change[] } | { kind: 'reset'; doc: BoardDoc };

const FLUSH_DELAY_MS = 120;
const MAX_BACKOFF_MS = 60_000;

const metaOf = (d: BoardMeta): BoardMeta => ({
  puzzleId: d.puzzleId,
  n: d.n,
  seed: d.seed,
  round: d.round,
  seconds: d.seconds,
  solved: d.solved,
  updatedAt: d.updatedAt,
});

function blankDoc(meta: BoardMeta): BoardDoc {
  return { ...metaOf(meta), cells: emptyBoard(meta.n), vers: new Array(meta.n * meta.n).fill(0) };
}

/**
 * Keeps both players' boards in step.
 *
 * Every local move is applied immediately, written to the device cache, and
 * put in an outbox. The outbox is sent to the server in order, and stays on
 * the device until the server confirms it, so moves survive going offline,
 * closing the app, or a failed request. Moves from the server are merged per
 * cell: the one with the later clock value wins (last write wins).
 */
export class SyncEngine {
  private metas = new Map<string, BoardMeta>();
  private solvedMap = new Map<string, SolvedRecord>();
  private docs = new Map<string, BoardDoc>();
  private cachedCells = new Map<string, CachedBoard>();
  private watchers = new Map<string, Set<(e: BoardEvent) => void>>();
  private listeners = new Set<() => void>();
  private clock: Clock;

  private status: SyncStatus;
  private error: string | null = null;
  private pending = 0;
  private snap: SyncSnapshot;

  private flushing: Promise<void> | null = null;
  private again = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 0;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    private cache: Cache,
    private remote: Remote | null,
    now: () => number = Date.now,
  ) {
    this.clock = new Clock(now);
    this.status = remote ? 'syncing' : 'local';
    this.snap = this.makeSnapshot();
  }

  // ---------- reading ----------

  getSnapshot = (): SyncSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Listen for changes to one open board made elsewhere. */
  watch(puzzleId: string, fn: (e: BoardEvent) => void): () => void {
    let set = this.watchers.get(puzzleId);
    if (!set) this.watchers.set(puzzleId, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  // ---------- lifecycle ----------

  async start(): Promise<void> {
    const { boards, solved } = await this.cache.load();
    for (const b of boards) {
      this.metas.set(b.puzzleId, metaOf(b));
      this.cachedCells.set(b.puzzleId, b);
      for (const v of b.vers) this.clock.observe(v);
    }
    for (const r of solved) this.solvedMap.set(r.puzzleId, r);
    this.pending = (await this.cache.queued()).length;
    this.emit();
    if (this.remote) void this.refresh();
  }

  /** Send anything queued, then fetch the latest list of boards and solves. */
  async refresh(): Promise<void> {
    if (!this.remote) return;
    await this.flush();
    try {
      const [boards, solves] = await Promise.all([this.remote.listBoards(), this.remote.listSolves()]);
      for (const b of boards) this.mergeMeta(b);
      for (const r of solves) {
        this.solvedMap.set(r.puzzleId, r);
        this.write(this.cache.putSolved(r));
      }
      if (!this.flushing && !this.pending) this.setStatus('synced', null);
      this.emit();
    } catch (e) {
      this.failed(e);
    }
  }

  // ---------- boards ----------

  /** Get a board to play: the device copy right away, then the server's newer moves as events. */
  open(puzzle: Pick<Puzzle, 'id' | 'n' | 'seed'>): BoardDoc {
    const doc = this.ensureDoc(puzzle.id, puzzle.n, puzzle.seed);
    if (this.remote) void this.pull(puzzle.id);
    return { ...doc, cells: doc.cells.slice(), vers: doc.vers.slice() };
  }

  private ensureDoc(puzzleId: string, n: number, seed?: number): BoardDoc {
    let doc = this.docs.get(puzzleId);
    if (!doc) {
      const cached = this.cachedCells.get(puzzleId);
      const cells = cached ? decodeCells(cached.cells, n) : null;
      doc =
        cached && cells
          ? { ...metaOf(cached), cells, vers: cached.vers.slice() }
          : blankDoc(this.metas.get(puzzleId) ?? { puzzleId, n, seed, round: 0, seconds: 0, solved: false, updatedAt: 0 });
      this.docs.set(puzzleId, doc);
    }
    return doc;
  }

  /** Fetch one board from the server and merge it in. */
  async pull(puzzleId: string): Promise<void> {
    if (!this.remote) return;
    try {
      const { meta, cells } = await this.remote.getBoard(puzzleId);
      for (const c of cells) this.clock.observe(c.ver);
      if (!meta) return;
      this.mergeMeta(meta);
      // Keep the cells on the device even if the board isn't open, so it opens instantly (and offline) later.
      const doc = this.ensureDoc(puzzleId, meta.n, meta.seed);
      if (doc.round === meta.round) this.mergeCells(doc, cells);
      this.emit();
    } catch (e) {
      this.failed(e);
    }
  }

  /** Merge cells that arrived from the server (Phase 4 realtime calls this too). */
  receiveCells(puzzleId: string, round: number, cells: RemoteCell[]): void {
    const doc = this.docs.get(puzzleId);
    for (const c of cells) this.clock.observe(c.ver);
    if (!doc) return;
    if (round > doc.round) {
      void this.pull(puzzleId);
      return;
    }
    if (round === doc.round) {
      this.mergeCells(doc, cells);
      this.emit();
    }
  }

  /** Record moves made on this device. */
  applyLocal(puzzleId: string, changes: readonly Change[]): void {
    const doc = this.docs.get(puzzleId);
    if (!doc || !changes.length) return;
    const moves = changes.map((c) => {
      const v = this.clock.next();
      doc.cells[c.i] = c.next;
      doc.vers[c.i] = v;
      return { i: c.i, s: c.next.s, o: c.next.s === 0 ? null : c.next.by, v };
    });
    doc.updatedAt = Date.now();
    this.saveDoc(doc);
    this.enqueue({ kind: 'moves', puzzleId, n: doc.n, seed: doc.seed, round: doc.round, seconds: doc.seconds, moves });
  }

  /** Save the play time. Only for boards someone has started, so looking at a puzzle doesn't start it. */
  saveSeconds(puzzleId: string, seconds: number, round?: number): void {
    const doc = this.docs.get(puzzleId);
    // `round` guards against a closing screen saving its time into a board that was just reset.
    if (!doc || !this.metas.has(puzzleId) || seconds <= doc.seconds || (round !== undefined && round !== doc.round)) return;
    doc.seconds = seconds;
    this.saveDoc(doc);
    this.enqueue({ kind: 'moves', puzzleId, n: doc.n, seed: doc.seed, round: doc.round, seconds, moves: [] });
  }

  markSolved(record: SolvedRecord): void {
    const doc = this.docs.get(record.puzzleId);
    if (!doc) return;
    doc.solved = true;
    doc.seconds = Math.max(doc.seconds, record.seconds);
    this.saveDoc(doc);
    this.solvedMap.set(record.puzzleId, record);
    this.write(this.cache.putSolved(record));
    this.enqueue({ kind: 'solve', puzzleId: record.puzzleId, round: doc.round, record });
  }

  /** "Play again": a fresh board in a new round. Returns it. */
  reset(puzzleId: string): BoardDoc | null {
    const doc = this.docs.get(puzzleId);
    if (!doc) return null;
    const fromRound = doc.round;
    const fresh = blankDoc({ ...metaOf(doc), round: fromRound + 1, seconds: 0, solved: false, updatedAt: Date.now() });
    this.docs.set(puzzleId, fresh);
    this.saveDoc(fresh);
    this.enqueue({ kind: 'reset', puzzleId, fromRound });
    return { ...fresh, cells: fresh.cells.slice(), vers: fresh.vers.slice() };
  }

  // ---------- sending ----------

  /** Send the outbox now. Safe to call any time; concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = this.runFlush().finally(() => {
      this.flushing = null;
      if (this.again) {
        this.again = false;
        void this.flush();
      }
    });
    return this.flushing;
  }

  /** Called when the browser says it's back online. */
  online(): void {
    this.backoff = 0;
    void this.refresh();
  }

  /** Wait until everything written to the device cache has landed (used by tests). */
  async settled(): Promise<void> {
    let w;
    do {
      w = this.writes;
      await w;
    } while (w !== this.writes);
  }

  private async runFlush(): Promise<void> {
    const remote = this.remote!;
    await this.settled();
    try {
      for (;;) {
        const queue = await this.cache.queued();
        this.pending = queue.length;
        if (!queue.length) break;
        this.setStatus('syncing', this.error);

        // Send the first op; merge following moves for the same board and round into it.
        const first = queue[0];
        let op: Op = first.op;
        const keys = [first.key];
        for (const q of queue.slice(1)) {
          if (op.kind !== 'moves' || q.op.kind !== 'moves' || q.op.puzzleId !== op.puzzleId || q.op.round !== op.round) break;
          op = { ...op, seconds: Math.max(op.seconds, q.op.seconds), moves: [...op.moves, ...q.op.moves] };
          keys.push(q.key);
        }
        await this.send(remote, op);
        await this.cache.dequeue(keys);
      }
      this.backoff = 0;
      this.pending = 0;
      this.setStatus('synced', null);
    } catch (e) {
      this.failed(e);
    }
    this.emit();
  }

  private async send(remote: Remote, op: Op): Promise<void> {
    if (op.kind === 'moves') {
      const round = await remote.applyMoves(op);
      // The board was reset elsewhere, so the server ignored these moves. Catch up.
      if (round !== op.round) void this.pull(op.puzzleId);
    } else if (op.kind === 'solve') {
      await remote.recordSolve(op);
    } else {
      const round = await remote.resetBoard(op);
      if (round !== op.fromRound + 1) void this.pull(op.puzzleId);
    }
  }

  private enqueue(op: Op): void {
    this.pending++;
    this.emit();
    // Never merge into the outbox while it is being sent, or merged moves could be dropped with the sent entry.
    this.write(this.cache.enqueue(op, () => !this.flushing));
    if (!this.remote) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
  }

  private failed(e: unknown): void {
    const offline = e instanceof OfflineError || (typeof navigator !== 'undefined' && navigator.onLine === false);
    this.setStatus(offline ? 'offline' : 'error', offline ? null : messageOf(e));
    this.emit();
    // Try again later, waiting longer each time (2s, 4s, 8s … up to a minute).
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff ? this.backoff * 2 : 2000);
    this.retryTimer = setTimeout(() => void this.refresh(), this.backoff);
  }

  // ---------- merging ----------

  private mergeMeta(remote: BoardMeta): void {
    const local = this.metas.get(remote.puzzleId);
    const doc = this.docs.get(remote.puzzleId);
    if (local && remote.round < local.round) return; // our "Play again" hasn't reached the server yet
    if (local && remote.round > local.round) {
      // Someone pressed "Play again" elsewhere: start the new round here too.
      const fresh = blankDoc(remote);
      this.metas.set(remote.puzzleId, metaOf(remote));
      this.cachedCells.delete(remote.puzzleId);
      if (doc) {
        this.docs.set(remote.puzzleId, fresh);
        this.saveDoc(fresh);
        this.notify(remote.puzzleId, { kind: 'reset', doc: { ...fresh, cells: fresh.cells.slice(), vers: fresh.vers.slice() } });
        void this.pull(remote.puzzleId);
      } else {
        this.write(this.cache.putBoard({ ...metaOf(remote), cells: '.'.repeat(remote.n * remote.n), vers: fresh.vers }));
      }
      return;
    }
    const merged: BoardMeta = local
      ? { ...local, seconds: Math.max(local.seconds, remote.seconds), solved: local.solved || remote.solved, updatedAt: Math.max(local.updatedAt, remote.updatedAt) }
      : metaOf(remote);
    this.metas.set(remote.puzzleId, merged);
    if (doc) Object.assign(doc, { seconds: merged.seconds, solved: merged.solved, updatedAt: merged.updatedAt });
  }

  private mergeCells(doc: BoardDoc, cells: readonly RemoteCell[]): void {
    const changes: Change[] = [];
    for (const rc of cells) {
      this.clock.observe(rc.ver);
      if (rc.idx < 0 || rc.idx >= doc.cells.length) continue;
      const next: Cell = rc.state === 0 ? { s: 0, by: null } : { s: rc.state, by: rc.owner ?? 0 };
      const cur = doc.cells[rc.idx];
      if (rc.ver < doc.vers[rc.idx] || (rc.ver === doc.vers[rc.idx] && sameCell(cur, next))) continue;
      doc.vers[rc.idx] = rc.ver;
      if (sameCell(cur, next)) continue;
      changes.push({ i: rc.idx, prev: cur, next });
      doc.cells[rc.idx] = next;
    }
    this.saveDoc(doc, false);
    if (changes.length) this.notify(doc.puzzleId, { kind: 'cells', changes });
  }

  // ---------- helpers ----------

  private saveDoc(doc: BoardDoc, emit = true): void {
    const meta = metaOf(doc);
    this.metas.set(doc.puzzleId, meta);
    const cached: CachedBoard = { ...meta, cells: encodeCells(doc.cells), vers: doc.vers.slice() };
    this.cachedCells.set(doc.puzzleId, cached);
    this.write(this.cache.putBoard(cached));
    if (emit) this.emit();
  }

  /** Cache writes run one after another so a later write never lands before an earlier one. */
  private write(p: Promise<unknown>): void {
    this.writes = this.writes.then(
      () => p,
      () => p,
    );
    p.catch(() => this.setStatus(this.status, "Couldn't save on this device. Moves are kept while the app stays open."));
  }

  private notify(puzzleId: string, e: BoardEvent): void {
    this.watchers.get(puzzleId)?.forEach((fn) => fn(e));
  }

  private setStatus(s: SyncStatus, error: string | null): void {
    this.status = this.remote ? s : 'local';
    this.error = error;
  }

  private makeSnapshot(): SyncSnapshot {
    return { status: this.status, pending: this.pending, boards: new Map(this.metas), solved: new Map(this.solvedMap), error: this.error };
  }

  private emit(): void {
    this.snap = this.makeSnapshot();
    this.listeners.forEach((fn) => fn());
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong while syncing.';
}
