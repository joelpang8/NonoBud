import type { Player } from '../game';
import { OfflineError } from '../sync/types';
import type { ChatCache } from './cache';
import type { ChatMessage, ChatOp, ChatRemote, ChatSnapshot, Emoji, Reaction, ReadMarker } from './types';

export const MAX_LENGTH = 2000;
const HISTORY = 300;
const TYPING_MS = 4000;

const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The conversation. Like the board sync: everything is shown and saved on the
 * phone at once, and an outbox sends it to the server in order, keeping it
 * until the server confirms, so nothing written offline is lost.
 */
export class ChatEngine {
  private messages = new Map<string, ChatMessage>();
  private reactions = new Map<string, Map<Player, Emoji>>();
  private reads = new Map<Player, number>();
  private outbox: { key: number; op: ChatOp }[] = [];
  private listeners = new Set<() => void>();
  private snap: ChatSnapshot;
  private flushing: Promise<void> | null = null;
  private again = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private backoff = 0;
  private typingUntil = 0;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    private me: Player,
    private cache: ChatCache,
    private remote: ChatRemote | null,
    private now: () => number = Date.now,
  ) {
    this.snap = this.build();
  }

  getSnapshot = (): ChatSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  async start(): Promise<void> {
    const saved = await this.cache.load();
    saved.messages.forEach((m) => this.messages.set(m.id, m));
    saved.reactions.forEach((r) => this.setReaction(r));
    saved.reads.forEach((r) => this.reads.set(r.player, r.at));
    this.outbox = saved.outbox;
    this.emit();
    await this.refresh();
  }

  /** Fetch recent history and send anything waiting. Called on start, reconnect, and when the app returns. */
  async refresh(): Promise<void> {
    if (!this.remote) return;
    try {
      await this.flush();
      const { messages, reactions, reads } = await this.remote.recent(HISTORY);
      messages.forEach((m) => this.receiveMessage(m, false));
      reactions.forEach((r) => this.receiveReaction(r, false));
      reads.forEach((r) => this.receiveRead(r, false));
      this.emit();
    } catch (e) {
      this.failed(e);
    }
  }

  // ---------- doing things ----------

  send(body: string, puzzle?: { id: string; n: number; seed?: number } | null): ChatMessage | null {
    const text = body.trim().slice(0, MAX_LENGTH);
    if (!text) return null;
    const m: ChatMessage = {
      id: uuid(),
      author: this.me,
      body: text,
      puzzleId: puzzle?.id ?? null,
      puzzleN: puzzle?.n ?? null,
      puzzleSeed: puzzle?.seed ?? null,
      createdAt: Math.max(this.now(), this.newest() + 1),
      pending: true,
    };
    this.messages.set(m.id, m);
    this.write(this.cache.putMessage(m));
    // Writing a message means you've read everything before it.
    this.markRead(m.createdAt);
    this.enqueue({ kind: 'send', message: m });
    this.emit();
    return m;
  }

  /** Tap the same emoji again to take the reaction back. */
  react(messageId: string, emoji: Emoji): void {
    const current = this.reactions.get(messageId)?.get(this.me) ?? null;
    const r: Reaction = { messageId, player: this.me, emoji: current === emoji ? null : emoji };
    this.setReaction(r);
    this.write(this.cache.putReaction(r));
    this.enqueue({ kind: 'react', reaction: r });
    this.emit();
  }

  /** Everything up to `at` has been seen. Only ever moves forward. */
  markRead(at = this.newest()): void {
    if (at <= (this.reads.get(this.me) ?? 0)) return;
    const marker: ReadMarker = { player: this.me, at };
    this.reads.set(this.me, at);
    this.write(this.cache.putRead(marker));
    // Only the latest marker matters, so drop older ones still waiting to be sent.
    this.enqueue({ kind: 'read', marker });
    this.emit();
  }

  // ---------- arriving from the server ----------

  receiveMessage(m: ChatMessage, emit = true): void {
    const local = this.messages.get(m.id);
    const merged = { ...m, pending: false };
    if (local && !local.pending && local.createdAt === m.createdAt && local.body === m.body) return;
    this.messages.set(m.id, merged);
    this.write(this.cache.putMessage(merged));
    if (m.author !== this.me) this.typingUntil = 0;
    if (emit) this.emit();
  }

  receiveReaction(r: Reaction, emit = true): void {
    // Our own reaction still waiting to be sent wins over an older copy from the server.
    if (r.player === this.me && this.outbox.some((q) => q.op.kind === 'react' && q.op.reaction.messageId === r.messageId)) return;
    this.setReaction(r);
    this.write(this.cache.putReaction(r));
    if (emit) this.emit();
  }

  receiveRead(r: ReadMarker, emit = true): void {
    if (r.at <= (this.reads.get(r.player) ?? 0)) return;
    this.reads.set(r.player, r.at);
    this.write(this.cache.putRead(r));
    if (emit) this.emit();
  }

  /** The other person is typing (sent over the live channel, never stored). */
  partnerTyping(): void {
    this.typingUntil = this.now() + TYPING_MS;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.emit(), TYPING_MS + 50);
    this.emit();
  }

  online(): void {
    this.backoff = 0;
    void this.refresh();
  }

  async settled(): Promise<void> {
    let w;
    do {
      w = this.writes;
      await w;
    } while (w !== this.writes);
  }

  // ---------- sending ----------

  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
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

  private async runFlush(): Promise<void> {
    const remote = this.remote!;
    await this.settled();
    try {
      while (this.outbox.length) {
        const entry = this.outbox[0];
        const { op } = entry;
        if (op.kind === 'send') await remote.send(op.message);
        else if (op.kind === 'react') await remote.react(op.reaction);
        else await remote.read(op.marker);
        if (entry.key === -1) await this.settled(); // its place in the device outbox is still being written
        await this.cache.dequeue(entry.key);
        this.outbox.shift();
        if (op.kind === 'send') {
          const m = this.messages.get(op.message.id);
          if (m?.pending) this.messages.set(m.id, { ...m, pending: false });
        }
        this.emit();
      }
      this.backoff = 0;
    } catch (e) {
      this.failed(e);
    }
  }

  private enqueue(op: ChatOp): void {
    if (op.kind === 'read') {
      // A newer read marker replaces any older one that hasn't been sent.
      const stale = this.outbox.filter((q) => q.op.kind === 'read');
      if (stale.length && !this.flushing) {
        this.outbox = this.outbox.filter((q) => q.op.kind !== 'read');
        stale.forEach((q) => this.write(this.cache.dequeue(q.key)));
      }
    }
    const entry = { key: -1, op };
    this.outbox.push(entry);
    this.write(this.cache.enqueue(op).then((key) => (entry.key = key)));
    if (this.remote) setTimeout(() => void this.flush(), 0);
  }

  private failed(e: unknown): void {
    if (this.retry) clearTimeout(this.retry);
    this.backoff = Math.min(60_000, this.backoff ? this.backoff * 2 : 2000);
    this.retry = setTimeout(() => void this.refresh(), this.backoff);
    if (!(e instanceof OfflineError)) console.warn('Chat sync failed, will retry:', e);
  }

  // ---------- helpers ----------

  private setReaction(r: Reaction): void {
    let m = this.reactions.get(r.messageId);
    if (!m) this.reactions.set(r.messageId, (m = new Map()));
    if (r.emoji) m.set(r.player, r.emoji);
    else m.delete(r.player);
  }

  private newest(): number {
    let t = 0;
    this.messages.forEach((m) => (t = Math.max(t, m.createdAt)));
    return t;
  }

  private write(p: Promise<unknown>): void {
    this.writes = this.writes.then(
      () => p,
      () => p,
    );
    p.catch(() => {
      /* storage blocked: still works in memory */
    });
  }

  private build(): ChatSnapshot {
    const messages = [...this.messages.values()].sort(byTime);
    const seen = this.reads.get(this.me) ?? 0;
    const unread = messages.filter((m) => m.author !== this.me && m.createdAt > seen).length;
    return {
      messages,
      reactions: new Map([...this.reactions].map(([k, v]) => [k, new Map(v)])),
      reads: new Map(this.reads),
      unread,
      partnerTyping: this.typingUntil > this.now(),
    };
  }

  private emit(): void {
    this.snap = this.build();
    this.listeners.forEach((fn) => fn());
  }
}
