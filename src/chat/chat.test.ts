import type { Player } from '../game';
import { createMemoryChatCache, type ChatCache } from './cache';
import { ChatEngine } from './engine';
import { FakeChatServer } from './fake';

let t = 2_000_000;
const now = () => ++t;

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

function setup() {
  const server = new FakeChatServer();
  const phones: ChatEngine[] = [];
  // Live delivery, like Supabase Realtime.
  server.onMessage = (m) => phones.forEach((p) => p.receiveMessage(m));
  server.onReaction = (r) => phones.forEach((p) => p.receiveReaction(r));
  server.onRead = (r) => phones.forEach((p) => p.receiveRead(r));
  const phone = async (player: Player, cache: ChatCache = createMemoryChatCache()) => {
    const remote = server.client(player);
    const engine = new ChatEngine(player, cache, remote, now);
    await engine.start();
    phones.push(engine);
    return { engine, remote, cache };
  };
  return { server, phone };
}

const settle = async (...es: ChatEngine[]) => {
  for (const e of es) {
    await e.settled();
    await e.flush();
  }
  await Promise.resolve();
};

describe('chat', () => {
  it('sends a message that shows up for the other person, with an unread count', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    joel.engine.send('  hey, want to do the cat?  ', { id: 'p10-cat', n: 10 });
    expect(joel.engine.getSnapshot().messages[0]).toMatchObject({ body: 'hey, want to do the cat?', pending: true });
    await settle(joel.engine);
    expect(joel.engine.getSnapshot().messages[0].pending).toBe(false);
    const y = ysl.engine.getSnapshot();
    expect(y.messages.map((m) => [m.author, m.body, m.puzzleId])).toEqual([[0, 'hey, want to do the cat?', 'p10-cat']]);
    expect(y.unread).toBe(1);
    expect(joel.engine.getSnapshot().unread).toBe(0);
  });

  it('marking as read clears the badge on every device', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    const yslTablet = await phone(1);
    joel.engine.send('hi');
    await settle(joel.engine);
    ysl.engine.markRead();
    await settle(ysl.engine);
    expect(yslTablet.engine.getSnapshot().unread).toBe(0);
  });

  it('keeps messages written offline and sends them, in order, once back', async () => {
    const { server, phone } = setup();
    const joel = await phone(0);
    joel.remote.online = false;
    joel.engine.send('one');
    joel.engine.send('two');
    await settle(joel.engine);
    expect(server.messages.size).toBe(0);
    expect(joel.engine.getSnapshot().messages.every((m) => m.pending)).toBe(true);
    joel.remote.online = true;
    joel.engine.online();
    await vi.waitFor(() => expect(server.messages.size).toBe(2));
    expect([...server.messages.values()].sort((a, b) => a.createdAt - b.createdAt).map((m) => m.body)).toEqual(['one', 'two']);
  });

  it('survives closing the app before a message was sent', async () => {
    const { server, phone } = setup();
    const cache = createMemoryChatCache();
    const first = await phone(0, cache);
    first.remote.online = false;
    first.engine.send('see you tonight');
    await first.engine.settled();
    const again = await phone(0, cache); // reopened later, online
    await vi.waitFor(() => expect([...server.messages.values()].map((m) => m.body)).toEqual(['see you tonight']));
    expect(again.engine.getSnapshot().messages).toHaveLength(1);
  });

  it('never duplicates a message that is sent twice', async () => {
    const { server, phone } = setup();
    const joel = await phone(0);
    const m = joel.engine.send('only once')!;
    await settle(joel.engine);
    await server.client(0).send(m); // e.g. a retry after a timeout
    expect(server.messages.size).toBe(1);
    expect(joel.engine.getSnapshot().messages).toHaveLength(1);
  });

  it('reactions: one per person, tap again to remove', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    const ysl = await phone(1);
    const m = joel.engine.send('I finished the owl!')!;
    await settle(joel.engine);
    ysl.engine.react(m.id, '👏');
    await settle(ysl.engine);
    expect(joel.engine.getSnapshot().reactions.get(m.id)?.get(1)).toBe('👏');
    ysl.engine.react(m.id, '❤️');
    await settle(ysl.engine);
    expect(joel.engine.getSnapshot().reactions.get(m.id)?.get(1)).toBe('❤️');
    ysl.engine.react(m.id, '❤️');
    await settle(ysl.engine);
    expect(joel.engine.getSnapshot().reactions.get(m.id)?.has(1)).toBe(false);
  });

  it('shows "typing" briefly', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    joel.engine.partnerTyping();
    expect(joel.engine.getSnapshot().partnerTyping).toBe(true);
    t += 5000;
    vi.advanceTimersByTime(5000);
    expect(joel.engine.getSnapshot().partnerTyping).toBe(false);
  });

  it('ignores empty messages and trims very long ones', async () => {
    const { phone } = setup();
    const joel = await phone(0);
    expect(joel.engine.send('   ')).toBeNull();
    expect(joel.engine.send('x'.repeat(2500))!.body).toHaveLength(2000);
  });

  it('catches up on history after reconnecting', async () => {
    const { server, phone } = setup();
    const ysl = await phone(1);
    server.onMessage = undefined; // live delivery is down
    const joel = await phone(0);
    joel.engine.send('did you see this?');
    await settle(joel.engine);
    expect(ysl.engine.getSnapshot().messages).toHaveLength(0);
    await ysl.engine.refresh();
    expect(ysl.engine.getSnapshot().messages.map((m) => m.body)).toEqual(['did you see this?']);
  });
});
