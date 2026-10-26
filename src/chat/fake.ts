import type { Player } from '../game';
import { OfflineError } from '../sync/types';
import type { ChatMessage, ChatRemote, Reaction, ReadMarker } from './types';

/** In-memory chat server with the SQL rules (server time, real author, no duplicates), for tests. */
export class FakeChatServer {
  messages = new Map<string, ChatMessage>();
  reactions = new Map<string, Reaction>();
  reads = new Map<Player, ReadMarker>();
  clock = 1_000_000;
  onMessage?: (m: ChatMessage) => void;
  onReaction?: (r: Reaction) => void;
  onRead?: (r: ReadMarker) => void;

  client(player: Player): ChatRemote & { online: boolean } {
    const s = this;
    const gate = <T,>(fn: () => T): Promise<T> => (c.online ? Promise.resolve(structuredClone(fn())) : Promise.reject(new OfflineError()));
    const c = {
      online: true,
      recent: (limit: number) =>
        gate(() => {
          const messages = [...s.messages.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
          return { messages, reactions: [...s.reactions.values()], reads: [...s.reads.values()] };
        }),
      send: (m: ChatMessage) =>
        gate(() => {
          if (s.messages.has(m.id)) return;
          const stored = { ...m, author: player, createdAt: ++s.clock, pending: undefined };
          delete stored.pending;
          s.messages.set(m.id, stored);
          queueMicrotask(() => s.onMessage?.(structuredClone(stored)));
        }),
      react: (r: Reaction) =>
        gate(() => {
          const stored = { ...r, player };
          s.reactions.set(`${r.messageId}:${player}`, stored);
          queueMicrotask(() => s.onReaction?.(structuredClone(stored)));
        }),
      read: (m: ReadMarker) =>
        gate(() => {
          const stored = { ...m, player };
          s.reads.set(player, stored);
          queueMicrotask(() => s.onRead?.(structuredClone(stored)));
        }),
    };
    return c;
  }
}
