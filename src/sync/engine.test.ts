import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import type { Cell, Change, Player } from '../game';
import { createIndexedDbCache, createMemoryCache, type Cache } from './cache';
import { SyncEngine, type BoardEvent } from './engine';
import { FakeServer, type FakeClient } from './fakeRemote';

const HEART = { id: 'p5-heart', n: 5 };
let t = 1_000_000;
const now = () => t;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  t += 1000;
});
afterEach(() => vi.useRealTimers());

interface Device {
  engine: SyncEngine;
  remote: FakeClient;
  cache: Cache;
  player: Player;
  events: BoardEvent[];
}

async function device(server: FakeServer, player: Player, cache: Cache = createMemoryCache()): Promise<Device> {
  const remote = server.client(player);
  const engine = new SyncEngine(cache, remote, now);
  await engine.start();
  await engine.flush();
  const events: BoardEvent[] = [];
  engine.watch(HEART.id, (e) => events.push(e));
  return { engine, remote, cache, player, events };
}

/** Make moves on a device, the way the board screen does. */
function play(d: Device, cells: number[], s: 0 | 1 | 2 = 1): void {
  const doc = d.engine.open(HEART);
  const changes: Change[] = cells.map((i) => ({ i, prev: doc.cells[i], next: s === 0 ? { s: 0, by: null } : { s, by: d.player } }));
  d.engine.applyLocal(HEART.id, changes);
  t += 1;
}

async function sync(...ds: Device[]): Promise<void> {
  for (const d of ds) {
    await d.engine.settled();
    await d.engine.flush();
  }
  for (const d of ds) await d.engine.pull(HEART.id);
}

const states = (d: Device): number[] => d.engine.open(HEART).cells.map((c: Cell) => c.s);

describe('sync engine', () => {
  it('sends moves to the server and the partner sees them, in their color', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    const ysl = await device(server, 1);
    play(joel, [1, 3]);
    await sync(joel, ysl);
    const doc = ysl.engine.open(HEART);
    expect([doc.cells[1], doc.cells[3]]).toEqual([
      { s: 1, by: 0 },
      { s: 1, by: 0 },
    ]);
    expect(ysl.events.some((e) => e.kind === 'cells')).toBe(true);
    expect(joel.engine.getSnapshot().status).toBe('synced');
    expect(joel.engine.getSnapshot().pending).toBe(0);
  });

  it('keeps moves made offline and sends them when back online', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    joel.remote.online = false;
    play(joel, [0]);
    play(joel, [1]);
    await joel.engine.settled();
    await joel.engine.flush();
    expect(joel.engine.getSnapshot().status).toBe('offline');
    expect(joel.engine.getSnapshot().pending).toBeGreaterThan(0);
    expect(server.cells.get(HEART.id)).toBeUndefined();

    joel.remote.online = true;
    joel.engine.online();
    await vi.waitFor(() => expect(joel.engine.getSnapshot().status).toBe('synced'));
    expect([...server.cells.get(HEART.id)!.keys()].sort()).toEqual([0, 1]);
  });

  it('survives closing the app with moves still unsent', async () => {
    const server = new FakeServer();
    const cache = createMemoryCache();
    const first = await device(server, 0, cache);
    first.remote.online = false;
    play(first, [2, 4]);
    await first.engine.settled();

    // Reopen on the same device: the board and the outbox are still there.
    const again = await device(server, 0, cache);
    expect(states(again).slice(0, 5)).toEqual([0, 0, 1, 0, 1]);
    expect([...server.cells.get(HEART.id)!.keys()].sort()).toEqual([2, 4]);
  });

  it('last write wins per cell, even when the older move arrives later', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    const ysl = await device(server, 1);
    // Joel marks cell 7 first but is offline; YSL fills it afterwards and is online.
    joel.remote.online = false;
    play(joel, [7], 2);
    await joel.engine.settled();
    await joel.engine.flush();
    t += 10;
    play(ysl, [7], 1);
    await sync(ysl);
    // Joel comes back online: his older move must not overwrite YSL's newer one.
    joel.remote.online = true;
    await sync(joel, ysl);
    expect(server.cells.get(HEART.id)!.get(7)!.state).toBe(1);
    expect(joel.engine.open(HEART).cells[7]).toEqual({ s: 1, by: 1 });
    expect(ysl.engine.open(HEART).cells[7]).toEqual({ s: 1, by: 1 });
  });

  it('a move made after seeing the partner’s move wins even if this phone’s clock is behind', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    const ysl = await device(server, 1);
    play(ysl, [9]);
    await sync(ysl, joel);
    t -= 60_000; // Joel's clock is a minute slow
    play(joel, [9], 0);
    await sync(joel, ysl);
    expect(ysl.engine.open(HEART).cells[9].s).toBe(0);
  });

  it('does not lose moves made while an earlier batch is being sent', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    play(joel, [0]);
    await joel.engine.settled();
    joel.remote.hold();
    const sending = joel.engine.flush();
    await Promise.resolve();
    play(joel, [1]); // made while the first batch is in flight
    await joel.engine.settled();
    joel.remote.release();
    await sending;
    await vi.waitFor(async () => {
      await joel.engine.flush();
      expect([...(server.cells.get(HEART.id)?.keys() ?? [])].sort()).toEqual([0, 1]);
    });
  });

  it('play again on one phone resets the other, and old moves are ignored', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    const ysl = await device(server, 1);
    play(joel, [0, 1, 2]);
    await sync(joel, ysl);

    joel.engine.reset(HEART.id);
    ysl.remote.online = false;
    play(ysl, [4]); // YSL's move on the old round, stuck offline
    await sync(joel);
    expect(server.boards.get(HEART.id)!.round).toBe(1);

    ysl.remote.online = true;
    await sync(ysl, joel);
    expect(ysl.events.some((e) => e.kind === 'reset')).toBe(true);
    expect(states(ysl).every((s) => s === 0)).toBe(true);
    expect(states(joel).every((s) => s === 0)).toBe(true);
    expect(server.cells.get(HEART.id)!.size).toBe(0);
  });

  it('keeps syncing other boards when the server refuses one', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    const realApply = joel.remote.applyMoves.bind(joel.remote);
    joel.remote.applyMoves = (op) => (op.puzzleId === 'p30-big' ? Promise.reject(new Error('violates check constraint')) : realApply(op));
    const big = { id: 'p30-big', n: 30 };
    joel.engine.open(big);
    joel.engine.applyLocal(big.id, [{ i: 0, prev: { s: 0, by: null }, next: { s: 1, by: 0 } }]);
    play(joel, [3]);
    await sync(joel);
    expect(server.cells.get(HEART.id)?.has(3)).toBe(true);
    expect(joel.engine.getSnapshot().status).toBe('error');
    expect(joel.engine.getSnapshot().pending).toBeGreaterThan(0);
    // Once the server accepts it (e.g. after the new migration), the waiting moves go through.
    joel.remote.applyMoves = realApply;
    await joel.engine.flush();
    expect(server.cells.get('p30-big')?.has(0)).toBe(true);
    expect(joel.engine.getSnapshot().status).toBe('synced');
  });

  it('records solves for the level list and gallery on both devices', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    const ysl = await device(server, 1);
    play(joel, [0]);
    joel.engine.markSolved({ puzzleId: HEART.id, name: 'Heart', n: 5, seconds: 42, owners: '0', together: false, solvedAt: 1 });
    await sync(joel);
    await ysl.engine.refresh();
    expect(ysl.engine.getSnapshot().solved.get(HEART.id)?.seconds).toBe(42);
    expect(ysl.engine.getSnapshot().boards.get(HEART.id)?.solved).toBe(true);
  });

  it('only saves time for boards someone has started', async () => {
    const server = new FakeServer();
    const joel = await device(server, 0);
    joel.engine.open(HEART);
    joel.engine.saveSeconds(HEART.id, 30);
    expect(joel.engine.getSnapshot().boards.has(HEART.id)).toBe(false);
    play(joel, [0]);
    joel.engine.saveSeconds(HEART.id, 30);
    await sync(joel);
    expect(server.boards.get(HEART.id)!.seconds).toBe(30);
  });

  it('works with no server at all, keeping progress on the device', async () => {
    const cache = createMemoryCache();
    const engine = new SyncEngine(cache, null, now);
    await engine.start();
    engine.open(HEART);
    engine.applyLocal(HEART.id, [{ i: 0, prev: { s: 0, by: null }, next: { s: 1, by: 0 } }]);
    await engine.settled();
    expect(engine.getSnapshot().status).toBe('local');
    expect((await cache.load()).boards[0].cells[0]).toBe('A');
  });
});

describe('device cache', () => {
  it('upgrades Phase 2 progress and queues it for upload', async () => {
    const name = `upgrade-${Math.random()}`;
    const v1 = await openDB(name, 1, {
      upgrade(d) {
        d.createObjectStore('boards', { keyPath: 'puzzleId' });
        d.createObjectStore('solved', { keyPath: 'puzzleId' });
      },
    });
    await v1.put('boards', { puzzleId: 'p5-heart', n: 5, cells: 'AB.x' + '.'.repeat(21), seconds: 33, solved: false, updatedAt: 1 });
    await v1.put('solved', { puzzleId: 'p5-tree', name: 'Tree', n: 5, seconds: 20, owners: '.', together: false, solvedAt: 1 });
    v1.close();

    const cache = createIndexedDbCache(name);
    const { boards } = await cache.load();
    expect(boards[0].round).toBe(0);
    expect(boards[0].vers.slice(0, 4).map((v) => v > 0)).toEqual([true, true, false, true]);
    const ops = (await cache.queued()).map((q) => q.op);
    expect(ops.map((o) => o.kind)).toEqual(['moves', 'solve']);
    const moves = ops[0].kind === 'moves' ? ops[0].moves : [];
    expect(moves.map((m) => [m.i, m.s, m.o])).toEqual([
      [0, 1, 0],
      [1, 1, 1],
      [3, 2, 0],
    ]);

    // And it reaches the server on first sync.
    const server = new FakeServer();
    const engine = new SyncEngine(cache, server.client(0), now);
    await engine.start();
    await vi.waitFor(() => expect(server.solves.has('p5-tree')).toBe(true));
    expect(server.cells.get('p5-heart')!.size).toBe(3);
    expect(server.boards.get('p5-heart')!.seconds).toBe(33);
  });

  it('merges consecutive moves in the outbox', async () => {
    const cache = createMemoryCache();
    const base = { kind: 'moves' as const, puzzleId: 'a', n: 5, round: 0, seconds: 0 };
    await cache.enqueue({ ...base, moves: [{ i: 0, s: 1, o: 0, v: 1 }] }, () => true);
    await cache.enqueue({ ...base, seconds: 5, moves: [{ i: 0, s: 0, o: null, v: 2 }, { i: 1, s: 1, o: 0, v: 3 }] }, () => true);
    await cache.enqueue({ ...base, moves: [{ i: 2, s: 1, o: 0, v: 4 }] }, () => false);
    const q = await cache.queued();
    expect(q).toHaveLength(2);
    expect(q[0].op).toMatchObject({ seconds: 5, moves: [{ i: 0, s: 0, v: 2 }, { i: 1, v: 3 }] });
  });
});
