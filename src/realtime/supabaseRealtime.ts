import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { CellState, Player } from '../game';
import type { BoardMeta, RemoteCell } from '../sync';
import { messageFromRow, reactionFromRow, readFromRow, type MessageRow } from '../chat/remote';
import type { BoardHandlers, ChatHandlers, Invite, PresenceHandlers, PresenceInfo, PresenceSession, Realtime } from './types';

const PRESENCE_TOPIC = 'cellmates-presence';

interface CellRow {
  puzzle_id: string;
  idx: number;
  state: number;
  owner: number | null;
  ver: number | string;
  round: number;
}

interface BoardRow {
  puzzle_id: string;
  n: number;
  seed: number | string | null;
  round: number;
  seconds: number;
  solved: boolean;
  updated_at: string;
}

export function cellFromRow(r: CellRow): { round: number; cell: RemoteCell } {
  return { round: r.round, cell: { idx: r.idx, state: r.state as CellState, owner: r.owner as Player | null, ver: Number(r.ver) } };
}

export function boardFromRow(r: BoardRow): BoardMeta {
  return {
    puzzleId: r.puzzle_id,
    n: r.n,
    seed: r.seed === null ? undefined : Number(r.seed),
    round: r.round,
    seconds: r.seconds,
    solved: r.solved,
    updatedAt: Date.parse(r.updated_at),
  };
}

/** Latest info per player from Supabase's presence state (a player can have several tabs open). */
export function peersFrom(state: Record<string, (PresenceInfo & { at?: number })[]>): PresenceInfo[] {
  const byPlayer = new Map<Player, PresenceInfo & { at?: number }>();
  for (const list of Object.values(state))
    for (const p of list) {
      const cur = byPlayer.get(p.player);
      if (!cur || (p.at ?? 0) >= (cur.at ?? 0)) byPlayer.set(p.player, p);
    }
  return [...byPlayer.values()].map(({ player, puzzleId, n, seed }) => ({ player, puzzleId, n, seed }));
}

export function createSupabaseRealtime(sb: SupabaseClient): Realtime {
  return {
    watchBoard(puzzleId: string, h: BoardHandlers) {
      const filter = `puzzle_id=eq.${puzzleId}`;
      const channel: RealtimeChannel = sb
        .channel(`board:${puzzleId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_cells', filter }, (p) => {
          const { round, cell } = cellFromRow(p.new as CellRow);
          h.onCells(round, [cell]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'board_cells', filter }, (p) => {
          const { round, cell } = cellFromRow(p.new as CellRow);
          h.onCells(round, [cell]);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter }, (p) => {
          if (p.eventType !== 'DELETE') h.onBoard(boardFromRow(p.new as BoardRow));
        })
        .subscribe((status) => {
          // Fires again after every automatic reconnect.
          if (status === 'SUBSCRIBED') h.onConnected();
        });
      return () => void sb.removeChannel(channel);
    },

    watchChat(h: ChatHandlers) {
      const channel = sb
        .channel('chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => h.onMessage(messageFromRow(p.new as MessageRow)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => {
          if (p.eventType !== 'DELETE') h.onReaction(reactionFromRow(p.new as { message_id: string; player: number; emoji: string | null }));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, (p) => {
          if (p.eventType !== 'DELETE') h.onRead(readFromRow(p.new as { player: number; last_read_at: string }));
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') h.onConnected();
        });
      return () => void sb.removeChannel(channel);
    },

    joinPresence(me: PresenceInfo, h: PresenceHandlers): PresenceSession {
      let info = me;
      const channel = sb.channel(PRESENCE_TOPIC, {
        config: { private: true, presence: { key: `player-${me.player}`, enabled: true } },
      });
      const track = () => void channel.track({ ...info, at: Date.now() });
      channel
        .on('presence', { event: 'sync' }, () => h.onPeers(peersFrom(channel.presenceState<PresenceInfo & { at?: number }>())))
        .on('broadcast', { event: 'invite' }, ({ payload }) => h.onInvite(payload as Invite))
        .on('broadcast', { event: 'typing' }, ({ payload }) => h.onTyping?.((payload as { player: Player }).player))
        .subscribe((status) => {
          const ok = status === 'SUBSCRIBED';
          h.onConnected(ok);
          if (ok) track();
        });
      return {
        set(next) {
          info = next;
          track();
        },
        invite(inv) {
          void channel.send({ type: 'broadcast', event: 'invite', payload: inv });
        },
        typing() {
          void channel.send({ type: 'broadcast', event: 'typing', payload: { player: me.player } });
        },
        leave() {
          void sb.removeChannel(channel);
        },
      };
    },
  };
}
