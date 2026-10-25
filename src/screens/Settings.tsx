import { useAuth } from '../auth/AuthGate';
import type { Route } from '../hooks/useHashRoute';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { feel } from '../lib/feedback';
import { PLAYER_NAMES } from '../lib/players';
import { canVibrate, updateSettings, useSettings, type Settings as S } from '../lib/settings';

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Settings({ go }: { go: (r: Route) => void }) {
  const s = useSettings();
  const auth = useAuth();
  const install = useInstallPrompt();

  return (
    <>
      <div className="top">
        <button type="button" className="back" onClick={() => go({ name: 'home' })}>
          ‹ Levels
        </button>
        <div className="ttl">
          <h1>Settings</h1>
          <div className="m">
            <span>These apply to this device only.</span>
          </div>
        </div>
      </div>

      <section className="settings" aria-label="Feedback">
        <Toggle
          label="Sound"
          hint="Soft clicks when you fill or mark, and a chime when you finish."
          on={s.sound}
          onChange={(v) => {
            updateSettings({ sound: v });
            if (v) feel('fill');
          }}
        />
        <Toggle
          label="Vibration"
          hint={canVibrate() ? 'A tiny buzz on each cell.' : "This phone or browser doesn't let web apps vibrate (iPhones don't)."}
          on={s.vibration && canVibrate()}
          onChange={(v) => {
            updateSettings({ vibration: v });
            if (v) feel('fill');
          }}
        />
        <fieldset className="setting theme">
          <legend>
            <b>Appearance</b>
          </legend>
          <div className="seg" role="group" aria-label="Appearance">
            {(['system', 'light', 'dark'] as S['theme'][]).map((t) => (
              <button key={t} type="button" aria-pressed={s.theme === t} onClick={() => updateSettings({ theme: t })}>
                {t === 'system' ? 'Match phone' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {!install.installed && (
        <section className="settings" aria-labelledby="install-h">
          <h2 id="install-h">Put Cellmates on your home screen</h2>
          {install.canPrompt ? (
            <button type="button" className="pri-btn" onClick={() => void install.install()}>
              Install the app
            </button>
          ) : install.isIOS ? (
            <p>
              In Safari, tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>.
            </p>
          ) : (
            <p>
              In Chrome, open the <b>⋮</b> menu and choose <b>Install app</b> (or <b>Add to Home screen</b>).
            </p>
          )}
        </section>
      )}

      <section className="settings" aria-labelledby="account-h">
        <h2 id="account-h">Account</h2>
        {auth.mode === 'cloud' ? (
          <>
            <p>
              Signed in as <b>{PLAYER_NAMES[auth.player]}</b> ({auth.email}).
            </p>
            <button type="button" className="back" onClick={() => void auth.signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <p>Not connected to Supabase, so progress is saved on this device only. The README explains how to connect.</p>
        )}
      </section>

      <p className="note">Cellmates {__APP_VERSION__}</p>
    </>
  );
}
