import { useCallback, useState } from 'react';
import type { Player } from '../game';
import { readLocal, writeLocal } from '../lib/storage';

const KEY = 'cellmates-player';

/** Which person is holding this device. Temporary until sign-in arrives in Phase 3. */
export function usePlayer(): [Player, (p: Player) => void] {
  const [player, setPlayer] = useState<Player>(() => (readLocal(KEY) === '1' ? 1 : 0));
  const set = useCallback((p: Player) => {
    setPlayer(p);
    writeLocal(KEY, String(p));
  }, []);
  return [player, set];
}
