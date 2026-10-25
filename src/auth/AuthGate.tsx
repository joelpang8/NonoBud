import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Logo } from '../components/Logo';
import type { Player } from '../game';
import { readLocal, writeLocal } from '../lib/storage';
import { supabase } from './supabase';
import { SignIn, NewPassword } from './SignIn';

export type Auth =
  /** Not connected to Supabase: one device, pick the player by hand. */
  | { mode: 'local' }
  | { mode: 'cloud'; email: string; player: Player; signOut: () => Promise<void> };

const Ctx = createContext<Auth>({ mode: 'local' });
export const useAuth = () => useContext(Ctx);

type State =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'recovery' }
  | { kind: 'notMember'; email: string }
  | { kind: 'member'; email: string; player: Player };

const MEMBER_KEY = 'cellmates-member';

/** Which player an email is, from the guest list. Remembered so the app opens offline too. */
async function lookUpPlayer(session: Session): Promise<Player | null> {
  const email = (session.user.email ?? '').toLowerCase();
  const { data, error } = await supabase!.from('allowed_emails').select('player').eq('email', email).maybeSingle();
  if (error) {
    // Offline: trust what this device learned last time for the same email.
    const cached = readLocal(MEMBER_KEY);
    if (cached) {
      const [e, p] = cached.split('|');
      if (e === email && (p === '0' || p === '1')) return Number(p) as Player;
    }
    throw error;
  }
  if (!data) return null;
  writeLocal(MEMBER_KEY, `${email}|${data.player}`);
  return data.player as Player;
}

export function AuthGate({ children }: { children: ReactNode }) {
  if (!supabase) return <Ctx.Provider value={{ mode: 'local' }}>{children}</Ctx.Provider>;
  return <CloudGate>{children}</CloudGate>;
}

function CloudGate({ children }: { children: ReactNode }) {
  const sb = supabase!;
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [problem, setProblem] = useState<string | null>(null);

  const resolve = useCallback(async (session: Session | null) => {
    if (!session) return setState({ kind: 'signedOut' });
    const email = session.user.email ?? '';
    try {
      const player = await lookUpPlayer(session);
      setProblem(null);
      setState(player === null ? { kind: 'notMember', email } : { kind: 'member', email, player });
    } catch {
      setProblem("Can't reach the server to check your account. Check your connection; this page will retry when you're back online.");
      setState({ kind: 'checking' });
    }
  }, []);

  useEffect(() => {
    let current: Session | null = null;
    void sb.auth.getSession().then(({ data }) => {
      current = data.session;
      void resolve(data.session);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      current = session;
      if (event === 'PASSWORD_RECOVERY') setState({ kind: 'recovery' });
      else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void resolve(session);
    });
    const retry = () => void resolve(current);
    window.addEventListener('online', retry);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', retry);
    };
  }, [sb, resolve]);

  const signOut = useCallback(async () => {
    await sb.auth.signOut();
  }, [sb]);

  if (state.kind === 'checking') {
    return (
      <main className="app loading" aria-busy={!problem}>
        <Logo />
        <p>{problem ?? 'Checking your account…'}</p>
      </main>
    );
  }
  if (state.kind === 'signedOut') return <SignIn />;
  if (state.kind === 'recovery') return <NewPassword onDone={() => void sb.auth.getSession().then(({ data }) => resolve(data.session))} />;
  if (state.kind === 'notMember') {
    return (
      <main className="app">
        <div className="empty">
          <h2>This app is private</h2>
          <p>
            {state.email} isn't on the guest list. If that's the wrong email, sign out and use the one that was added in
            Supabase.
          </p>
          <button type="button" className="pri-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </main>
    );
  }
  return <Ctx.Provider value={{ mode: 'cloud', email: state.email, player: state.player, signOut }}>{children}</Ctx.Provider>;
}
