import type { Change, Player } from '../game';
import { createMemoryCache, SyncEngine, type BoardEvent } from '../sync';
import { FakeServer } from '../sync/fakeRemote';
import { FakeHub } from './fakeRealtime';
import { watchLive } from './live';
import { peersFrom } from './supabaseRealtime';

const HEART = { id: 'p5-heart', n: 5 };
let t = 5_000_000;
const now = () => t;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  t += 1000;
});
afterEach(() => vi.useRealTimers());

function setup() {
  const server = new FakeServer();
  const hub = new FakeHub();
  server.onCells = (id, round, cells) => hub.publishCells(id, round, cells);
  server.onBoard = (meta) => hub.publishBoard(meta);
  const phone = async (player: Player) => {
    const engine = new SyncEngine(createMemoryCache(), server.client(player), now);
    await engine.start();
    engine.open(HEART);
    const events: BoardEvent[] = [];
    engine.watch(HEART.id, (e) => events.push(e));
    const stop = watchLive(engine, hub.client(), HEART.id);
    const play = async (cells: number[], s: 0 | 1 | 2 = 1) => {
      const doc = engine.open(HEART);
      const changes: Change[] = cells.map((i) => ({ i, prev: doc.cells[i], next: s ? { s, by: player } : { s: 0, by: null } }));
      engine.applyLocal(HEART.id, changes);
      t += 1;
      await engine.settled();
      await engine.flush();
      await Promise.resolve(); // let the server publish
    };
    return { engine, events, stop, play };
  };
  return { server, hub, phone };
}

const cellEvents = (events: BoardEvent[]) => events.filter((e): e is Extract<BoardEvent, { kind: 'cells' }> => e.kind === 'cells');

describe('live co-op', () => {
  it('shows the partner’s moves as they happen, without reopening the puzzle', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    await vi.waitFor(() => expect(true).toBe(true));
    ysl.events.length = 0;
    await joel.play([2]);
    await vi.waitFor(() => expect(cellEvents(ysl.events).flatMap((e) => e.changes.map((c) => c.i))).toContain(2));
    expect(ysl.engine.open(HEART).cells[2]).toEqual({ s: 1, by: 0 });
  });

  it('catches up on moves missed while the connection was down', async () => {
    const { hub, phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    hub.connected = false;
    await joel.play([0, 1, 4]);
    expect(ysl.engine.open(HEART).cells[4].s).toBe(0);
    hub.reconnect();
    await vi.waitFor(() => expect([0, 1, 4].map((i) => ysl.engine.open(HEART).cells[i].s)).toEqual([1, 1, 1]));
  });

  it('ignores an older update that arrives after a newer one', async () => {
    const { phone } = setup();
    const ysl = await phone(1);
    ysl.engine.receiveCells(HEART.id, 0, [{ idx: 7, state: 1, owner: 0, ver: 900 }]);
    ysl.engine.receiveCells(HEART.id, 0, [{ idx: 7, state: 2, owner: 0, ver: 800 }]);
    expect(ysl.engine.open(HEART).cells[7]).toEqual({ s: 1, by: 0 });
  });

  it('ignores updates from a round that was already restarted', async () => {
    const { phone } = setup();
    const ysl = await phone(1);
    ysl.engine.reset(HEART.id);
    ysl.engine.receiveCells(HEART.id, 0, [{ idx: 3, state: 1, owner: 0, ver: Number.MAX_SAFE_INTEGER }]);
    expect(ysl.engine.open(HEART).cells[3].s).toBe(0);
  });

  it('two people filling different cells at the same time both keep their moves', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    await Promise.all([joel.play([0, 1, 2]), ysl.play([20, 21, 22])]);
    await vi.waitFor(() => {
      for (const p of [joel, ysl]) {
        const cells = p.engine.open(HEART).cells;
        expect([0, 1, 2].map((i) => cells[i].by)).toEqual([0, 0, 0]);
        expect([20, 21, 22].map((i) => cells[i].by)).toEqual([1, 1, 1]);
      }
    });
  });

  it('restarts the partner’s board live when one of you presses Play again', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    await joel.play([0, 1]);
    joel.engine.reset(HEART.id);
    await joel.engine.settled();
    await joel.engine.flush();
    await vi.waitFor(() => expect(ysl.events.some((e) => e.kind === 'reset')).toBe(true));
    expect(ysl.engine.open(HEART).cells.every((c) => c.s === 0)).toBe(true);
  });

  it('shares the clock: the partner’s longer time shows up live', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    await joel.play([0]);
    joel.engine.saveSeconds(HEART.id, 95);
    await joel.engine.settled();
    await joel.engine.flush();
    await vi.waitFor(() => expect(ysl.events).toContainEqual({ kind: 'meta', seconds: 95, solved: false }));
  });
});

describe('presence', () => {
  it('shares which puzzle each of you has open, and delivers invites to the other person only', () => {
    const hub = new FakeHub();
    const seenByJoel: string[] = [];
    const invitesForYsl: string[] = [];
    const invitesForJoel: string[] = [];
    const joel = hub.client().joinPresence({ player: 0, puzzleId: null, n: null, seed: null }, {
      onPeers: (ps) => seenByJoel.push(ps.map((p) => `${p.player}:${p.puzzleId}`).join(',')),
      onInvite: (i) => invitesForJoel.push(i.puzzleId),
      onConnected: () => {},
    });
    const ysl = hub.client().joinPresence({ player: 1, puzzleId: 'p10-cat', n: 10, seed: null }, {
      onPeers: () => {},
      onInvite: (i) => invitesForYsl.push(i.puzzleId),
      onConnected: () => {},
    });
    expect(seenByJoel.at(-1)).toBe('0:null,1:p10-cat');
    joel.invite({ from: 0, puzzleId: 'p5-heart', n: 5, seed: null, at: 1 });
    expect(invitesForYsl).toEqual(['p5-heart']);
    expect(invitesForJoel).toEqual([]);
    ysl.leave();
    expect(seenByJoel.at(-1)).toBe('0:null');
  });

  it('keeps the newest presence per player when one has two tabs open', () => {
    const peers = peersFrom({
      a: [{ player: 1, puzzleId: 'old', n: 5, seed: null, at: 1 }],
      b: [{ player: 1, puzzleId: 'new', n: 5, seed: null, at: 2 }],
      c: [{ player: 0, puzzleId: null, n: null, seed: null, at: 1 }],
    });
    expect(peers.find((p) => p.player === 1)?.puzzleId).toBe('new');
    expect(peers).toHaveLength(2);
  });
});
