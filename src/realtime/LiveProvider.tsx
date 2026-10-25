import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthGate';
import { supabase } from '../auth/supabase';
import type { Player } from '../game';
import { createSupabaseRealtime } from './supabaseRealtime';
import type { Invite, PresenceInfo, PresenceSession, Realtime } from './types';

interface Live {
  /** Null when not signed in to Supabase (device-only mode): no live features. */
  realtime: Realtime | null;
  /** The other person, if they have the app open right now. */
  partner: PresenceInfo | null;
  /** Tell the other person which puzzle is on screen (null for the level list). */
  showing: (info: Pick<PresenceInfo, 'puzzleId' | 'n' | 'seed'>) => void;
  invite: (puzzle: { puzzleId: string; n: number; seed: number | null }) => void;
  incoming: Invite | null;
  dismissInvite: () => void;
}

const NOBODY: Pick<PresenceInfo, 'puzzleId' | 'n' | 'seed'> = { puzzleId: null, n: null, seed: null };
const Ctx = createContext<Live>({ realtime: null, partner: null, showing: () => {}, invite: () => {}, incoming: null, dismissInvite: () => {} });
export const useLive = () => useContext(Ctx);

export function LiveProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const me: Player | null = auth.mode === 'cloud' ? auth.player : null;
  const realtime = useMemo(() => (me !== null && supabase ? createSupabaseRealtime(supabase) : null), [me]);
  const [partner, setPartner] = useState<PresenceInfo | null>(null);
  const [incoming, setIncoming] = useState<Invite | null>(null);
  const session = useRef<PresenceSession | null>(null);
  const screen = useRef(NOBODY);

  useEffect(() => {
    if (!realtime || me === null) return;
    const s = realtime.joinPresence({ player: me, ...screen.current }, {
      onPeers: (peers) => setPartner(peers.find((p) => p.player !== me) ?? null),
      onInvite: (inv) => inv.from !== me && setIncoming(inv),
      onConnected: (ok) => !ok && setPartner(null),
    });
    session.current = s;
    return () => {
      s.leave();
      session.current = null;
      setPartner(null);
    };
  }, [realtime, me]);

  const showing = useCallback(
    (info: Pick<PresenceInfo, 'puzzleId' | 'n' | 'seed'>) => {
      screen.current = info;
      if (me !== null) session.current?.set({ player: me, ...info });
    },
    [me],
  );

  const invite = useCallback(
    (p: { puzzleId: string; n: number; seed: number | null }) => {
      if (me !== null) session.current?.invite({ from: me, ...p, at: Date.now() });
    },
    [me],
  );

  const value = useMemo(
    () => ({ realtime, partner, showing, invite, incoming, dismissInvite: () => setIncoming(null) }),
    [realtime, partner, showing, invite, incoming],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
