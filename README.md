# Cellmates

Nonograms for two: a private puzzle app for Joel and YSL. Solve the same puzzle together and
watch each other's moves appear live, or play on your own. It works on phones (installable to
the home screen, works offline) and on computers.

**Contents**

1. [What you need](#1-what-you-need)
2. [Run it on your computer](#2-run-it-on-your-computer)
3. [Set up Supabase](#3-set-up-supabase-accounts-and-shared-progress)
4. [Put it online with Vercel](#4-put-it-online-with-vercel)
5. [Install it on your phones](#5-install-it-on-your-phones)
6. [Playing](#6-playing)
7. [Add your own picture puzzles](#7-add-your-own-picture-puzzles)
8. [When something goes wrong](#8-when-something-goes-wrong)
9. [For developers](#9-for-developers)

---

## 1. What you need

All free:

- A **GitHub** account (the code lives in `joelpang8/NonoBud`).
- A **Supabase** account: the online database for accounts and shared progress.
- A **Vercel** account: hosts the app at a web address so your phones can reach it anywhere.
- **Node.js 22** on your computer, only for running or changing the app locally:
  https://nodejs.org (the "LTS" download).

## 2. Run it on your computer

In Terminal, inside the project folder:

```bash
npm install
npm run dev -- --host
```

- On the computer, open http://localhost:5173.
- On a phone on the same Wi-Fi, open the **Network** address it prints, e.g. `http://192.168.1.159:5173`.

Without Supabase settings, the app runs in **device-only mode**: everything works, progress is
saved on that device, and a Joel/YSL switch on the home screen picks whose color you play.
Press **Ctrl+C** in Terminal to stop it.

## 3. Set up Supabase (accounts and shared progress)

You do this once.

### 3.1 Create the project
1. Go to https://supabase.com, click **Start your project**, and sign up.
2. Click **New project**:
   - **Name:** `cellmates`
   - **Database password:** click **Generate a password** and save it somewhere safe
     (the app doesn't need it).
   - **Region:** the closest one.
3. Click **Create new project** and wait a couple of minutes.

### 3.2 Create the tables (run the migrations)
The database setup lives in `supabase/migrations`. Run each file **once, in name order**:

1. `20261025000100_cellmates.sql` (tables, guest list, security rules)
2. `20261026000100_live_coop.sql` (live updates)
3. `20261027000100_chat.sql` (chat)
4. `20261028000100_bigger_boards.sql` (25×25 and 30×30 puzzles)

For each one: in Terminal, in the project folder, copy it to the clipboard:
```bash
pbcopy < supabase/migrations/20261025000100_cellmates.sql
```
Then in Supabase open **SQL Editor → New query**, click in the box, press **Cmd+V**, and click
**Run**. You should see *"Success. No rows returned"*. Repeat with the second file.

(Not on a Mac? Open the file in any text editor, select all, copy, and paste it in.)

### 3.3 Add the two of you to the guest list
**New query**, paste this with the **real emails, in lowercase**, then **Run**:
```sql
insert into public.allowed_emails (email, player, display_name) values
  ('joel-email@example.com', 0, 'Joel'),
  ('ysl-email@example.com', 1, 'YSL');
```
Player 0 is rose (Joel), player 1 is teal (YSL). Only these two emails can ever create an
account; anyone else sees *"This app is private"*. To change an email later, edit the row in
**Table Editor → allowed_emails**.

### 3.4 Auth settings
1. **Authentication → Sign In / Providers → Email**: keep Email on, turn **Confirm email** off,
   **Save**. (Only your two emails can sign up anyway, and Supabase's free email sending is
   limited to a few per hour.)
2. **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5173` for now. After deploying (section 4) change it to your
     Vercel address.
   - **Redirect URLs:** add `http://localhost:5173/**`. After deploying, also add
     `https://YOUR-APP.vercel.app/**`. "Forgot your password?" links only go to these addresses.

### 3.5 Connect the app on your computer
1. In Supabase click **Connect** at the top (or **Project Settings → API Keys**). You need the
   **Project URL** and the **Publishable key** (an older **anon public** key also works).
2. In Terminal, in the project folder:
   ```bash
   cp .env.example ~/cellmates.env && open -e ~/cellmates.env
   ```
   Replace the two example values, save (Cmd+S), close TextEdit.
3. Then:
   ```bash
   cp ~/cellmates.env .env.local
   npm run dev -- --host
   ```
Keeping the master copy in `~/cellmates.env` means you can copy it into any fresh download.

### 3.6 Create your accounts
Open the app, tap **Create account**, and use your guest-list email and a password of at least
8 characters. YSL does the same with hers. Anything played in device-only mode on that device
is uploaded the first time you sign in.

**Optional extra lock:** once both accounts exist, turn off **Allow new users to sign up** in
**Authentication → Sign In / Providers**. Signing in and password resets keep working.

## 4. Put it online with Vercel

This gives the app a permanent `https://` address that works on any network, and lets it be
installed on your phones.

1. Go to https://vercel.com and **Sign up** with your GitHub account (the free **Hobby** plan).
2. Click **Add New… → Project**.
3. Find **NonoBud** in the list and click **Import**. If it isn't listed, click
   **Adjust GitHub App Permissions** (or **Configure GitHub App**), give Vercel access to the
   `NonoBud` repository, and come back.
4. On the setup page:
   - **Project Name:** `cellmates` (this becomes part of the address; pick another if it's taken).
   - **Framework Preset:** Vite (detected automatically). Leave the build settings as they are.
   - Open **Environment Variables** and add two, with the same values as your `~/cellmates.env`:
     - `VITE_SUPABASE_URL` = your Project URL
     - `VITE_SUPABASE_KEY` = your Publishable key
5. Click **Deploy** and wait about a minute. You get an address like
   `https://cellmates-abc.vercel.app`. Open it to check it works.
6. Back in **Supabase → Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel address.
   - Add `https://YOUR-APP.vercel.app/**` to **Redirect URLs**.

**Updates are automatic:** whenever new code lands on GitHub, Vercel rebuilds and publishes it
within a minute or two. The installed app picks up the new version the next time it's opened
(close it fully and reopen if you want it right away).

If you change the Supabase values later, update them in **Vercel → your project → Settings →
Environment Variables**, then **Deployments → ⋯ → Redeploy**.

## 5. Install it on your phones

Open your Vercel address on each phone, sign in, then:

- **iPhone (Safari):** tap **Share** (the square with an arrow), then **Add to Home Screen**,
  then **Add**. It has to be Safari; other iPhone browsers can't install web apps.
- **Android (Chrome):** tap the **⋮** menu, then **Install app** (or **Add to Home screen**). The
  app's **Settings** page also has an **Install the app** button on Android.

The installed app opens full-screen and still opens without internet: you can keep playing, and
moves sync when you're back online.

## 6. Playing

- **Fill:** tap a cell, or drag along a row or column. Starting a drag on a filled cell erases.
- **Mark X:** switch the tool to **Mark X**, or right-click on a computer.
- **Clues** fade once their row or column is right. Thicker lines every 5 cells help counting.
- **Undo** only undoes your own moves, never your partner's. **Check** outlines mistakes,
  **Hint** fills one correct cell, **Start over** clears the board (it asks first if that would
  clear your partner's cells too).
- **Big boards on phones:** **Zoom in** makes cells bigger; scroll by swiping on the clue numbers.
  25×25 and 30×30 open zoomed in on phones; **Fit to screen** shows the whole picture.
- **Keyboard:** Tab to the grid, arrow keys move, Space or Enter fills, X marks, Delete clears,
  Shift+arrows repeat the last action along the way.

**Together:**
- Open the same puzzle on both phones to see each other's moves live; new cells briefly pulse in
  the other person's color. "YSL is here" (or "Joel is here") shows under the board.
- The level list shows what the other person is playing, with a **Join** button.
- **Invite to this puzzle** pops up a Join banner on the other phone. If they don't have the app
  open, **Send a link** opens your phone's share sheet.
- If you both change the same cell at the same moment, the later move wins, the same on both
  phones. A phone that goes offline keeps its moves and sends them when it's back.
- Each cell remembers who filled it, so finished pictures in the **Gallery** show who did what.

**Chat:** the round speech-bubble button at the bottom right opens your conversation. Messages
arrive instantly, show which puzzle they were sent from (tap the 🧩 tag to jump there), and
can be reacted to by tapping a bubble (❤️ 😂 👏 🤔). You'll see "typing…", "Seen", an unread badge,
and a short preview when a message arrives while the chat is closed. Messages written offline
are sent when you're back online. Only the two of you can read them. Chat reaches the other
person while their app is open; there are no phone notifications yet.

**Settings** (gear icon, per device): sound (off by default), vibration (Android only; iPhones
don't let web apps vibrate), light/dark/match phone, install help, and sign out.

## 7. Add your own picture puzzles

1. Draw a small black-and-white picture in a pixel-art app (free:
   [Piskel](https://www.piskelapp.com), [Pixilart](https://www.pixilart.com)).
   - Square: **5×5, 10×10, 15×15, 20×20, 25×25 or 30×30** pixels (bigger exports are fine if every cell is
     the same size, e.g. 16 pixels per cell).
   - Dark pixels are filled cells. White or transparent pixels are blank.
   - The file name becomes the puzzle name: `our-dog.png` becomes "Our dog".
   - To be sure of the size, put it in the name: `our-dog@15.png` (the `@15` isn't shown).
     Without it, a chunky drawing made of 2×2 blocks can come out as a smaller puzzle.
2. Add it to the `art` folder in one of two ways:
   - **Easiest (no computer setup):** on github.com open the `NonoBud` repository, go into the
     `art` folder, click **Add file → Upload files**, drop in the PNG, and click
     **Commit changes**. Vercel rebuilds, and the puzzle appears in a minute or two.
   - **On your computer:** put the PNG in `art/` and run `npm run art`.
   **Never edit or rename a picture that's already in the app**: saved progress is tied to each
   puzzle's file name and picture. Add new files instead. (`npm test` checks this.)
3. Every puzzle must have exactly one answer that can be reached by logic alone. Pictures that
   don't are skipped with a note such as *"it has more than one answer (stuck cells are in rows
   3, 4). Change a pixel or two there."* Locally, the note prints in Terminal. On Vercel, open
   the latest deployment and read the **Building** log.

## 8. When something goes wrong

| What you see | What to do |
| --- | --- |
| "Can't reach the server…" after a long break | Free Supabase projects pause after about a week without use. Open the Supabase dashboard and click **Restore project**. |
| "Offline. Your moves are safe…" | Nothing. Keep playing; it syncs when the connection is back. |
| "This app is private, and that email isn't on the guest list." | Check the email matches the `allowed_emails` row exactly (lowercase). |
| "That email and password don't match." | Check for typos, or use **Forgot your password?**. |
| The password-reset link doesn't sign you in | Open the link on the same phone and browser where you asked for it, and check the address is in Supabase's **Redirect URLs**. |
| "YSL is here" never shows, but moves still sync | Check the second migration (`…_live_coop.sql`) was run. |
| No chat button, or messages never send | Check the third migration (`…_chat.sql`) was run. The chat button only appears when signed in. |
| 25×25 or 30×30 moves say "Can't sync right now" | Run the fourth migration (`…_bigger_boards.sql`). Moves wait safely on the phone until then. |
| The installed app looks out of date | Close it fully and reopen it. |
| A Vercel deploy failed | Vercel keeps the previous version online. Open the failed deployment's log, or send it to whoever is helping you. |
| "Something went wrong" screen | Tap **Reload**. Your moves are already saved. |

## 9. For developers

```bash
npm run dev        # local dev server
npm test           # unit, component and database tests
npm run typecheck  # TypeScript
npm run build      # rebuild puzzles from /art, typecheck, production build into dist/
npm run art        # rebuild src/puzzles/library.json from /art
npm run release-puzzles  # lock new puzzles so tests catch any later change to them
npm run icons      # redraw the app icons
```

The database tests run the real SQL migrations on PGlite (Postgres in-process) with a small
stand-in for Supabase's `auth` schema, so the security rules are checked without a Supabase project.

| Folder | What's in it |
| --- | --- |
| `src/solver` | Line solver, grid solver, uniqueness search, seeded random generator. No React. |
| `src/game` | Board rules: strokes, undo (own moves only), check, hint, win. No React. |
| `src/sync` | Device cache (IndexedDB), offline outbox, hybrid-clock last-write-wins merge, Supabase calls. |
| `src/realtime` | Live board updates (Postgres changes), presence, invites and typing (private channel). |
| `src/chat` | Chat: on-device history and outbox, Supabase calls, live updates. |
| `src/auth` | Sign in, create account, password reset, guest-list check. |
| `src/components`, `src/screens` | The React UI. |
| `src/puzzles` | Puzzle library (`library.json` is generated from `/art`). |
| `supabase` | SQL migrations and their tests. |
| `art` | One PNG per picture puzzle. |
| `scripts` | Art-to-puzzle converter and icon generator. |

**Design decisions that differ from the original prototype:**
- Three prototype pictures were adjusted by one mirrored pixel pair: Cat and Star needed a
  guess, and Butterfly had five valid answers.
- Picture names stay hidden until solved, on the play screen too.
- Colors are fixed per person (Joel rose, YSL teal) on every screen, rather than "me" vs "them".
- Undo reverses only your own strokes and never overwrites a partner's later move.
- Wins are detected by every clue being satisfied rather than by an exact picture match (the
  same thing for single-answer puzzles, which all of ours are).
- Random puzzles are always solvable by logic and are rebuilt from a seed, so both phones get
  the same puzzle.
- Sign-in is email and password, not magic links: on iPhone, magic links open in Safari rather
  than the installed app.
