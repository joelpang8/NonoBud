import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChatMessage, ChatOp, Reaction, ReadMarker } from './types';

/** Chat lives in its own on-device database, separate from the puzzle boards. */
export interface ChatCache {
  load(): Promise<{ messages: ChatMessage[]; reactions: Reaction[]; reads: ReadMarker[]; outbox: { key: number; op: ChatOp }[] }>;
  putMessage(m: ChatMessage): Promise<void>;
  putReaction(r: Reaction): Promise<void>;
  putRead(m: ReadMarker): Promise<void>;
  enqueue(op: ChatOp): Promise<number>;
  dequeue(key: number): Promise<void>;
}

interface Schema extends DBSchema {
  messages: { key: string; value: ChatMessage };
  reactions: { key: string; value: Reaction };
  reads: { key: number; value: ReadMarker };
  outbox: { key: number; value: ChatOp };
}

export function createIndexedDbChatCache(name = 'cellmates-chat'): ChatCache {
  let db: Promise<IDBPDatabase<Schema>> | null = null;
  const open = () =>
    (db ??= openDB<Schema>(name, 1, {
      upgrade(d) {
        d.createObjectStore('messages', { keyPath: 'id' });
        d.createObjectStore('reactions', { keyPath: ['messageId', 'player'] });
        d.createObjectStore('reads', { keyPath: 'player' });
        d.createObjectStore('outbox', { autoIncrement: true });
      },
    }));
  return {
    async load() {
      const d = await open();
      const tx = d.transaction('outbox');
      const outbox: { key: number; op: ChatOp }[] = [];
      for (let c = await tx.store.openCursor(); c; c = await c.continue()) outbox.push({ key: c.key, op: c.value });
      const [messages, reactions, reads] = await Promise.all([d.getAll('messages'), d.getAll('reactions'), d.getAll('reads')]);
      return { messages, reactions, reads, outbox };
    },
    async putMessage(m) {
      await (await open()).put('messages', m);
    },
    async putReaction(r) {
      await (await open()).put('reactions', r);
    },
    async putRead(m) {
      await (await open()).put('reads', m);
    },
    async enqueue(op) {
      return (await open()).add('outbox', op);
    },
    async dequeue(key) {
      await (await open()).delete('outbox', key);
    },
  };
}

export function createMemoryChatCache(): ChatCache {
  const messages = new Map<string, ChatMessage>();
  const reactions = new Map<string, Reaction>();
  const reads = new Map<number, ReadMarker>();
  const outbox = new Map<number, ChatOp>();
  let next = 1;
  const c = <T,>(v: T): T => structuredClone(v);
  return {
    async load() {
      return {
        messages: [...messages.values()].map(c),
        reactions: [...reactions.values()].map(c),
        reads: [...reads.values()].map(c),
        outbox: [...outbox.entries()].map(([key, op]) => ({ key, op: c(op) })),
      };
    },
    async putMessage(m) {
      messages.set(m.id, c(m));
    },
    async putReaction(r) {
      reactions.set(`${r.messageId}:${r.player}`, c(r));
    },
    async putRead(m) {
      reads.set(m.player, c(m));
    },
    async enqueue(op) {
      outbox.set(next, c(op));
      return next++;
    },
    async dequeue(key) {
      outbox.delete(key);
    },
  };
}
