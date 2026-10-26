import type { SupabaseClient } from '@supabase/supabase-js';
import type { Player } from '../game';
import { OfflineError } from '../sync/types';
import type { ChatMessage, ChatRemote, Emoji, Reaction, ReadMarker } from './types';

export interface MessageRow {
  id: string;
  author: number;
  body: string;
  puzzle_id: string | null;
  puzzle_n: number | null;
  puzzle_seed: number | string | null;
  created_at: string;
}

export const messageFromRow = (r: MessageRow): ChatMessage => ({
  id: r.id,
  author: r.author as Player,
  body: r.body,
  puzzleId: r.puzzle_id,
  puzzleN: r.puzzle_n,
  puzzleSeed: r.puzzle_seed === null ? null : Number(r.puzzle_seed),
  createdAt: Date.parse(r.created_at),
});

export const reactionFromRow = (r: { message_id: string; player: number; emoji: string | null }): Reaction => ({
  messageId: r.message_id,
  player: r.player as Player,
  emoji: r.emoji as Emoji | null,
});

export const readFromRow = (r: { player: number; last_read_at: string }): ReadMarker => ({ player: r.player as Player, at: Date.parse(r.last_read_at) });

async function call<T>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  let res;
  try {
    res = await p;
  } catch (e) {
    throw e instanceof TypeError ? new OfflineError(e.message) : e;
  }
  if (!res.error) return res.data;
  if (!res.error.code || /fetch|network|load failed/i.test(res.error.message)) throw new OfflineError(res.error.message);
  throw new Error(res.error.message);
}

export function createSupabaseChat(sb: SupabaseClient): ChatRemote {
  return {
    async recent(limit) {
      const rows = (await call(
        sb.from('messages').select('id, author, body, puzzle_id, puzzle_n, puzzle_seed, created_at').order('created_at', { ascending: false }).limit(limit),
      )) as MessageRow[];
      const ids = rows.map((r) => r.id);
      const [reactions, reads] = await Promise.all([
        ids.length ? call(sb.from('message_reactions').select('message_id, player, emoji').in('message_id', ids)) : Promise.resolve([]),
        call(sb.from('chat_reads').select('player, last_read_at')),
      ]);
      return {
        messages: rows.map(messageFromRow),
        reactions: (reactions as { message_id: string; player: number; emoji: string | null }[]).map(reactionFromRow),
        reads: (reads as { player: number; last_read_at: string }[]).map(readFromRow),
      };
    },
    async send(m) {
      // The server stamps the author and time; a resend of the same id is ignored.
      await call(
        sb.from('messages').upsert(
          { id: m.id, author: m.author, body: m.body, puzzle_id: m.puzzleId, puzzle_n: m.puzzleN, puzzle_seed: m.puzzleSeed },
          { onConflict: 'id', ignoreDuplicates: true },
        ),
      );
    },
    async react(r) {
      await call(sb.from('message_reactions').upsert({ message_id: r.messageId, player: r.player, emoji: r.emoji }, { onConflict: 'message_id,player' }));
    },
    async read(m) {
      await call(sb.from('chat_reads').upsert({ player: m.player, last_read_at: new Date(m.at).toISOString() }, { onConflict: 'player' }));
    },
  };
}
