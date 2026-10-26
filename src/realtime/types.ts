import type { Player } from '../game';
import type { ChatMessage, Reaction, ReadMarker } from '../chat/types';
import type { BoardMeta, RemoteCell } from '../sync';

/** What each player shares about themselves while the app is open. */
export interface PresenceInfo {
  player: Player;
  /** The puzzle on screen, or null on the level list / gallery. */
  puzzleId: string | null;
  n: number | null;
  seed: number | null;
}

/** "Come and play this with me." */
export interface Invite {
  from: Player;
  puzzleId: string;
  n: number;
  seed: number | null;
  at: number;
}

export interface BoardHandlers {
  onCells(round: number, cells: RemoteCell[]): void;
  onBoard(meta: BoardMeta): void;
  /** The live connection (re)opened. Anything sent while it was down must be fetched. */
  onConnected(): void;
}

export interface PresenceHandlers {
  onPeers(peers: PresenceInfo[]): void;
  onInvite(invite: Invite): void;
  onConnected(connected: boolean): void;
  /** The other person is typing a chat message. */
  onTyping?(player: Player): void;
}

export interface PresenceSession {
  set(info: PresenceInfo): void;
  invite(invite: Invite): void;
  typing(): void;
  leave(): void;
}

export interface ChatHandlers {
  onMessage(m: ChatMessage): void;
  onReaction(r: Reaction): void;
  onRead(r: ReadMarker): void;
  /** The live connection (re)opened: fetch anything missed. */
  onConnected(): void;
}

/** Live updates. Supabase Realtime in the app; an in-memory hub in tests. */
export interface Realtime {
  watchBoard(puzzleId: string, h: BoardHandlers): () => void;
  joinPresence(me: PresenceInfo, h: PresenceHandlers): PresenceSession;
  watchChat(h: ChatHandlers): () => void;
}
