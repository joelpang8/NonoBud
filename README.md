# Cellmates

Nonograms for two. A private app for Joel and YSL.

> Status: **Phase 4 (live co-op)**. Polish and deployment come in Phase 5.

## Run it on your computer

1. Install **Node.js 22** from https://nodejs.org (choose the "LTS" download).
2. Open a terminal in this folder and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open the address it prints (usually http://localhost:5173).

### Try it on your phone (same Wi-Fi)

```bash
npm run dev -- --host
```
It prints a "Network" address like `http://192.168.1.20:5173`. Open that on your phone.
(Installing to the home screen needs HTTPS, so that part is tested after deploying.)

## Set up Supabase (accounts and shared progress)

Supabase is the free online database that lets both of you share puzzles. You do this once.
Without it the app still works, but only saves on the device you're using.

### 1. Create the project
1. Go to https://supabase.com and click **Start your project**. Sign up (GitHub or email is fine).
2. Click **New project**.
   - **Name:** `cellmates`
   - **Database password:** click **Generate a password** and save it somewhere safe.
     (The app doesn't need it, but you might later.)
   - **Region:** the one closest to you.
3. Click **Create new project** and wait a couple of minutes until it says it's ready.

### 2. Create the tables
1. In the left sidebar, open **SQL Editor**, then click **New query** (or the **+** button).
2. Open the file `supabase/migrations/20261025000100_cellmates.sql` from this folder in a text
   editor, select everything, copy it, and paste it into the query box.
3. Click **Run**. You should see *"Success. No rows returned"*.

Then do the same with the second file, `supabase/migrations/20261026000100_live_coop.sql`
(it turns on live updates). Always run the files in name order, each one once.

### 3. Add the two of you to the guest list
1. Click **New query** again and paste this, **replacing the two emails** with the real ones
   (all lowercase):
   ```sql
   insert into public.allowed_emails (email, player, display_name) values
     ('joel-email@example.com', 0, 'Joel'),
     ('ysl-email@example.com', 1, 'YSL');
   ```
2. Click **Run**. Player 0 is rose (Joel), player 1 is teal (YSL).

Only these two emails can ever create an account. Anyone else gets *"This app is private"*.
To change an email later, edit the row in **Table Editor → allowed_emails**.

### 4. Auth settings
1. Left sidebar: **Authentication**, then **Sign In / Providers** (on older dashboards:
   **Providers → Email**).
2. Make sure **Email** is enabled, and turn **off** **Confirm email**, then **Save**.
   (Only your two emails can sign up anyway, so the confirmation email adds nothing, and
   Supabase's free email sending is limited to a few per hour.)
3. Open **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5173` for now (you'll change it to your real web address
     when you deploy in Phase 5).
   - Under **Redirect URLs**, click **Add URL** and add `http://localhost:5173/**`, plus your
     phone address like `http://192.168.1.159:5173/**`. These are used by "Forgot your password?".

### 5. Connect the app
1. In the Supabase dashboard, click **Connect** at the top (or **Project Settings → API Keys**).
   Copy the **Project URL** and the **Publishable key** (if you only see an older
   **anon public** key, that works too).
2. In Terminal, in your home folder, create a settings file you can reuse every time you
   download a new version:
   ```bash
   cp ~/Downloads/NonoBud-claude-admiring-mccarthy-984ado/.env.example ~/cellmates.env
   open -e ~/cellmates.env
   ```
   TextEdit opens. Replace the two example values with yours, save (Cmd+S) and close it.
3. Copy it into the project and restart the app:
   ```bash
   cd ~/Downloads/NonoBud-claude-admiring-mccarthy-984ado
   cp ~/cellmates.env .env.local
   npm run dev -- --host
   ```

### 6. Create your accounts
Open the app, tap **Create account**, and use the email from the guest list with a password of
at least 8 characters. YSL does the same on her phone with her email.
Anything you played before signing in on that device is uploaded automatically.

**Optional extra lock:** once both accounts exist, go to **Authentication → Sign In / Providers**
and turn off **Allow new users to sign up**. Signing in and password resets keep working.

### Playing together live
- Open the same puzzle on both phones and you'll see each other's moves as they happen. The
  other person's new cells pulse briefly. "YSL is here" (or "Joel is here") shows under the board.
- On the level list, a banner shows what the other person is playing, with a **Join** button.
- On a puzzle, **Invite to this puzzle** pops up a Join banner on the other phone. If they
  don't have the app open, **Send a link** opens your phone's share sheet instead.
- If both of you change the same cell at the same moment, the later move wins on both phones.
- If a phone loses its connection, its moves are kept and sent when it's back, and it catches
  up on everything it missed.

### Good to know
- Free Supabase projects **pause after about a week with no use**. If the app says it can't
  reach the server after a long break, open the Supabase dashboard and click **Restore project**.
- "Forgot your password?" emails a link. Open it **on the same device and browser** where you
  asked for it.
- The **SQL migration files** live in `supabase/migrations`. `npm test` runs them on a built-in
  test database to check the security rules.

## Add your own picture puzzles

1. Draw a small black-and-white picture in any pixel-art app
   (free options: [Piskel](https://www.piskelapp.com), [Pixilart](https://www.pixilart.com)).
   - Make it square: **5×5, 10×10, 15×15 or 20×20** pixels.
   - Black (or any dark color) = filled cell. White or transparent = blank.
   - Bigger exports are fine if every cell is the same size (e.g. 16 pixels per cell).
2. Save it as a PNG in the `art` folder. The file name becomes the puzzle name:
   `our-dog.png` becomes "Our dog".
3. In the terminal, in this folder, run:
   ```bash
   npm run art
   ```
   Each picture gets an `ok`, or a note like
   *"it has more than one answer (stuck cells are in rows 3, 4). Change a pixel or two there."*
   Every puzzle has to be solvable by logic alone, with no guessing. If a picture fails,
   change a pixel or two in the rows it names and run `npm run art` again.
4. The app picks up the new puzzles straight away.

## Checks

```bash
npm test          # unit tests (solver, game logic, routes)
npm run typecheck # TypeScript
npm run build     # production build into dist/
```

## Project layout

| Folder | What's in it |
| --- | --- |
| `src/solver` | Line solver, grid solver, seeded random generator. No React. Fully tested. |
| `src/game` | Board rules: strokes, undo, check, hint, win. No React. Fully tested. |
| `src/components`, `src/screens` | The React UI. |
| `src/puzzles` | The puzzle library (`library.json` is generated from `/art`). |
| `src/sync` | Saving and syncing: device cache, outbox for offline moves, last-write-wins merging, Supabase calls. |
| `src/auth` | Sign in, create account, password reset, guest-list check. |
| `src/realtime` | Live updates, "who's online", and invites (Supabase Realtime). |
| `supabase` | SQL migrations and their tests. |
| `art` | One PNG per picture puzzle. |
| `scripts` | `npm run art` builds puzzles from `/art`; `npm run icons` redraws the app icons. |
