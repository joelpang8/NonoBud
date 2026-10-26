import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthGate';
import { supabase } from '../auth/supabase';
import { useLive } from '../realtime/LiveProvider';
import { createIndexedDbChatCache, createMemoryChatCache } from './cache';
import { ChatEngine } from './engine';
import { watchChatLive } from './live';
import { createSupabaseChat } from './remote';
import type { ChatSnapshot } from './types';

const Ctx = createContext<ChatEngine | null>(null);

/** Chat needs two people, so it only exists when signed in to Supabase. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { realtime, onPartnerTyping } = useLive();
  const [engine, setEngine] = useState<ChatEngine | null>(null);
  const me = auth.mode === 'cloud' ? auth.player : null;

  useEffect(() => {
    if (me === null || !supabase) return;
    let live = true;
    const remote = createSupabaseChat(supabase);
    const boot = async () => {
      let e = new ChatEngine(me, createIndexedDbChatCache(), remote);
      try {
        await e.start();
      } catch {
        e = new ChatEngine(me, createMemoryChatCache(), remote);
        await e.start();
      }
      if (live) setEngine(e);
    };
    void boot();
    return () => {
      live = false;
      setEngine(null);
    };
  }, [me]);

  useEffect(() => (engine && realtime ? watchChatLive(engine, realtime) : undefined), [engine, realtime]);
  useEffect(() => (engine ? onPartnerTyping(() => engine.partnerTyping()) : undefined), [engine, onPartnerTyping]);
  useEffect(() => {
    if (!engine) return;
    const onVisible = () => document.visibilityState === 'visible' && void engine.refresh();
    const onOnline = () => engine.online();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [engine]);

  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}

export function useChatEngine(): ChatEngine | null {
  return useContext(Ctx);
}

const EMPTY: ChatSnapshot = { messages: [], reactions: new Map(), reads: new Map(), unread: 0, partnerTyping: false };
const noop = () => () => {};

export function useChat(): ChatSnapshot {
  const e = useContext(Ctx);
  return useSyncExternalStore(e ? e.subscribe : noop, e ? e.getSnapshot : () => EMPTY);
}
