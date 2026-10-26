import type { Player } from '../game';

export const REACTIONS = ['❤️', '😂', '👏', '🤔'] as const;
export type Emoji = (typeof REACTIONS)[number];

export interface ChatMessage {
  /** Made on the sending phone, so a resend never duplicates. */
  id: string;
  author: Player;
  body: string;
  /** The puzzle on screen when it was sent. */
  puzzleId: string | null;
  puzzleN: number | null;
  puzzleSeed: number | null;
  /** Server time once delivered; the phone's time while still sending. */
  createdAt: number;
  /** Still waiting to reach the server. */
  pending?: boolean;
}

export interface Reaction {
  messageId: string;
  player: Player;
  emoji: Emoji | null;
}

export interface ReadMarker {
  player: Player;
  at: number;
}

export type ChatOp =
  | { kind: 'send'; message: ChatMessage }
  | { kind: 'react'; reaction: Reaction }
  | { kind: 'read'; marker: ReadMarker };

export interface ChatSnapshot {
  messages: ChatMessage[];
  /** messageId -> player -> emoji */
  reactions: ReadonlyMap<string, ReadonlyMap<Player, Emoji>>;
  reads: ReadonlyMap<Player, number>;
  /** Messages from the other person that I haven't seen yet. */
  unread: number;
  /** Partner is typing right now. */
  partnerTyping: boolean;
}

/** The server side. Supabase in the app; an in-memory fake in tests. */
export interface ChatRemote {
  recent(limit: number): Promise<{ messages: ChatMessage[]; reactions: Reaction[]; reads: ReadMarker[] }>;
  send(m: ChatMessage): Promise<void>;
  react(r: Reaction): Promise<void>;
  read(m: ReadMarker): Promise<void>;
}
