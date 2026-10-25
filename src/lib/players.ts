import type { Player } from '../game';

/** Display names by player slot. Slot 0 is rose, slot 1 is teal. */
export const PLAYER_NAMES: Record<Player, string> = { 0: 'Joel', 1: 'YSL' };

export const other = (p: Player): Player => (p === 0 ? 1 : 0);
