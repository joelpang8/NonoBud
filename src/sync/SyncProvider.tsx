import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthGate';
import { supabase } from '../auth/supabase';
import { Logo } from '../components/Logo';
import { createIndexedDbCache, createMemoryCache } from './cache';
import { SyncEngine, type SyncSnapshot } from './engine';
import { createSupabaseRemote } from './supabaseRemote';

const Ctx = createContext<SyncEngine | null>(null);

/** Starts the sync engine for the signed-in member (or device-only mode) and keeps it fed. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const cloud = auth.mode === 'cloud';

  useEffect(() => {
    let live = true;
    const remote = cloud && supabase ? createSupabaseRemote(supabase) : null;
    const boot = async () => {
      let e = new SyncEngine(createIndexedDbCache(), remote);
      try {
        await e.start();
      } catch {
        // Storage blocked (some private-browsing modes): still play, but only in memory.
        e = new SyncEngine(createMemoryCache(), remote);
        await e.start();
        if (live) setStorageBlocked(true);
      }
      if (live) setEngine(e);
    };
    void boot();
    return () => {
      live = false;
    };
  }, [cloud]);

  // Catch up when the app comes back to the foreground or the network returns.
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

  if (!engine) {
    return (
      <main className="app loading" aria-busy="true">
        <Logo />
        <p>Loading your puzzles…</p>
      </main>
    );
  }
  return (
    <Ctx.Provider value={engine}>
      {storageBlocked && <p className="note warn">This browser is blocking storage, so moves are only kept while the app is open.</p>}
      {children}
    </Ctx.Provider>
  );
}

export function useEngine(): SyncEngine {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEngine must be used inside <SyncProvider>');
  return e;
}

export function useSync(): SyncSnapshot {
  const e = useEngine();
  return useSyncExternalStore(e.subscribe, e.getSnapshot);
}
