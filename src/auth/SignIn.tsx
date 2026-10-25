import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo';
import { supabase } from './supabase';

type Mode = 'signIn' | 'signUp' | 'forgot';

/** Turn Supabase's error messages into plain advice. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return "That email and password don't match. Check for typos, or create your account first if you haven't yet.";
  if (m.includes('database error saving new user') || m.includes('guest list')) return "This app is private, and that email isn't on the guest list.";
  if (m.includes('already registered') || m.includes('already been registered')) return 'There is already an account for that email. Sign in instead.';
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link Supabase sent you, then sign in.';
  if (m.includes('password should be') || m.includes('weak')) return 'Pick a longer password (at least 8 characters).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries for now. Wait a few minutes and try again.';
  if (m.includes('fetch') || m.includes('network') || m.includes('load failed')) return "Can't reach the server. Check your connection and try again.";
  return message;
}

export function SignIn() {
  const sb = supabase!;
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const addr = email.trim().toLowerCase();
    try {
      if (mode === 'signIn') {
        const { error } = await sb.auth.signInWithPassword({ email: addr, password });
        if (error) setError(friendlyAuthError(error.message));
      } else if (mode === 'signUp') {
        const { data, error } = await sb.auth.signUp({ email: addr, password });
        if (error) setError(friendlyAuthError(error.message));
        else if (!data.session) setInfo('Account created. Check your email for a confirmation link, then come back and sign in.');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(addr, { redirectTo: window.location.origin + window.location.pathname });
        if (error) setError(friendlyAuthError(error.message));
        else setInfo('If that email has an account, a reset link is on its way. Open it on this device, in this browser.');
      }
    } catch (err) {
      setError(friendlyAuthError((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app auth">
      <div className="brand">
        <Logo />
        <h1>Cellmates</h1>
      </div>
      <p className="lede">Nonograms for two. Sign in to share your puzzles.</p>

      {mode !== 'forgot' && (
        <div className="seg auth-tabs" role="group" aria-label="Sign in or create an account">
          <button type="button" aria-pressed={mode === 'signIn'} onClick={() => setMode('signIn')}>
            Sign in
          </button>
          <button type="button" aria-pressed={mode === 'signUp'} onClick={() => setMode('signUp')}>
            Create account
          </button>
        </div>
      )}

      <form className="form" onSubmit={submit}>
        {mode === 'forgot' && <h2>Reset your password</h2>}
        <label>
          Email
          <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signUp' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signUp' && <small>At least 8 characters.</small>}
          </label>
        )}
        {error && (
          <p className="form-msg err" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="form-msg" role="status">
            {info}
          </p>
        )}
        <button type="submit" className="pri-btn" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Send reset link'}
        </button>
        <button type="button" className="link-btn" onClick={() => setMode(mode === 'forgot' ? 'signIn' : 'forgot')}>
          {mode === 'forgot' ? 'Back to sign in' : 'Forgot your password?'}
        </button>
      </form>
    </main>
  );
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(friendlyAuthError(error.message));
    else onDone();
  };

  return (
    <main className="app auth">
      <div className="brand">
        <Logo />
        <h1>Cellmates</h1>
      </div>
      <form className="form" onSubmit={submit}>
        <h2>Choose a new password</h2>
        <label>
          New password
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <small>At least 8 characters.</small>
        </label>
        {error && (
          <p className="form-msg err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="pri-btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </main>
  );
}
