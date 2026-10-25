// @vitest-environment node
/**
 * Runs the real migration on an in-memory Postgres (PGlite) with a small
 * stand-in for Supabase's auth schema, then checks the security rules and
 * the last-write-wins behaviour as each kind of visitor.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..');
const JOEL = 'joel@example.com';
const YSL = 'ysl@example.com';

let db: PGlite;

/** Run SQL as a signed-in user (email) or as a logged-out visitor (null). */
async function as<T = Record<string, unknown>>(email: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [email ? JSON.stringify({ email }) : '']);
  await db.exec(`set role ${email ? 'authenticated' : 'anon'}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const move = (i: number, s: number, o: number | null, v: number) => ({ i, s, o, v });
const apply = (email: string, moves: object[], round = 0, seconds = 0) =>
  as<{ apply_moves: number }>(email, `select public.apply_moves('p5-heart', 5::smallint, null, $1, $2, $3::jsonb)`, [round, seconds, JSON.stringify(moves)]);
const cells = () => as<{ idx: number; state: number; owner: number | null; ver: string; writer: number }>(JOEL, `select idx, state, owner, ver, writer from public.board_cells order by idx`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(DIR, 'tests/supabase-stub.sql'), 'utf8'));
  for (const f of readdirSync(join(DIR, 'migrations')).sort()) await db.exec(readFileSync(join(DIR, 'migrations', f), 'utf8'));
  await db.exec(`insert into public.allowed_emails values ('${JOEL}', 0, 'Joel'), ('${YSL}', 1, 'YSL')`);
});

describe('guest list', () => {
  it('lets the two allowed emails sign up, in any letter case', async () => {
    await db.exec(`insert into auth.users (email) values ('${JOEL}'), ('YSL@Example.com')`);
  });

  it('refuses anyone else', async () => {
    await expect(db.exec(`insert into auth.users (email) values ('stranger@example.com')`)).rejects.toThrow(/not on the guest list/);
  });

  it('refuses changing an account email to one not on the list', async () => {
    await expect(db.exec(`update auth.users set email = 'stranger@example.com' where email = '${JOEL}'`)).rejects.toThrow(/guest list/);
  });

  it('shows the list to members only, and nobody can edit it from the app', async () => {
    expect(await as(JOEL, 'select * from public.allowed_emails')).toHaveLength(2);
    expect(await as('stranger@example.com', 'select * from public.allowed_emails')).toHaveLength(0);
    await expect(as(null, 'select * from public.allowed_emails')).rejects.toThrow(/permission denied/);
    await expect(as(JOEL, `insert into public.allowed_emails values ('x@example.com', 0, 'X')`)).rejects.toThrow();
    await as(JOEL, `update public.allowed_emails set display_name = 'Hacked'`);
    expect((await as<{ display_name: string }>(YSL, `select display_name from public.allowed_emails where player = 0`))[0].display_name).toBe('Joel');
  });
});

describe('row level security', () => {
  it('lets members save moves and read each other’s', async () => {
    expect((await apply(JOEL, [move(1, 1, 0, 100), move(3, 1, 0, 101)]))[0].apply_moves).toBe(0);
    const seen = await as(YSL, 'select idx from public.board_cells order by idx');
    expect(seen.map((r) => r.idx)).toEqual([1, 3]);
  });

  it('hides everything from strangers and logged-out visitors', async () => {
    expect(await as('stranger@example.com', 'select * from public.board_cells')).toHaveLength(0);
    expect(await as('stranger@example.com', 'select * from public.boards')).toHaveLength(0);
    await expect(as(null, 'select * from public.boards')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from public.board_progress')).rejects.toThrow(/permission denied/);
  });

  it('stops strangers writing directly or through the functions', async () => {
    await expect(as('stranger@example.com', `insert into public.boards (puzzle_id, n) values ('x', 5)`)).rejects.toThrow(/row-level security/);
    await expect(apply('stranger@example.com', [move(0, 1, 0, 999)])).rejects.toThrow(/Only members/);
    await expect(as(null, `select public.apply_moves('p5-heart', 5::smallint, null, 0, 0, '[]'::jsonb)`)).rejects.toThrow(/permission denied/);
    await expect(as('stranger@example.com', `select public.reset_board('p5-heart', 0)`)).rejects.toThrow(/Only members/);
  });
});

describe('last write wins per cell', () => {
  it('keeps the newer move even when an older one arrives later', async () => {
    await apply(YSL, [move(5, 1, 1, 300)]);
    await apply(JOEL, [move(5, 2, 0, 200)]); // older, e.g. sent late after being offline
    const c = (await cells()).find((r) => r.idx === 5)!;
    expect([c.state, c.owner, Number(c.ver), c.writer]).toEqual([1, 1, 300, 1]);
  });

  it('records who made the move, not who the client claims', async () => {
    await apply(JOEL, [move(6, 1, 0, 400)]);
    expect((await cells()).find((r) => r.idx === 6)!.writer).toBe(0);
  });

  it('breaks exact ties by player so both devices agree', async () => {
    await apply(JOEL, [move(7, 1, 0, 500)]);
    await apply(YSL, [move(7, 2, 1, 500)]);
    await apply(JOEL, [move(7, 1, 0, 500)]);
    const c = (await cells()).find((r) => r.idx === 7)!;
    expect([c.state, c.writer]).toEqual([2, 1]);
  });

  it('takes the newest of several moves to one cell in a batch', async () => {
    await apply(JOEL, [move(8, 1, 0, 601), move(8, 0, null, 603), move(8, 2, 0, 602)]);
    expect((await cells()).find((r) => r.idx === 8)!.state).toBe(0);
  });

  it('keeps the larger time from either player', async () => {
    await apply(JOEL, [], 0, 50);
    await apply(YSL, [], 0, 30);
    expect((await as<{ seconds: number }>(JOEL, `select seconds from public.boards where puzzle_id = 'p5-heart'`))[0].seconds).toBe(50);
  });

  it('reports per-player progress', async () => {
    const [p] = await as<{ filled_by_joel: string; filled_by_ysl: string }>(JOEL, `select * from public.board_progress`);
    // Joel filled 1, 3 and 6; YSL filled 5; 7 is an X and 8 is blank.
    expect([Number(p.filled_by_joel), Number(p.filled_by_ysl)]).toEqual([3, 1]);
  });
});

describe('live co-op', () => {
  it('stamps each cell with its round', async () => {
    await apply(JOEL, [move(11, 1, 0, 800)]);
    const [c] = await as<{ round: number }>(JOEL, `select round from public.board_cells where idx = 11`);
    expect(c.round).toBe(0);
  });

  it('publishes board changes to realtime', async () => {
    const rows = await as<{ tablename: string }>(JOEL, `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
    expect(rows.map((r) => r.tablename)).toEqual(['board_cells', 'boards']);
  });

  it('lets only members use the presence and invite channel', async () => {
    await as(JOEL, `insert into realtime.messages (topic, extension, event) values ('cellmates', 'presence', 'x')`);
    expect(await as(YSL, `select * from realtime.messages`)).toHaveLength(1);
    expect(await as('stranger@example.com', `select * from realtime.messages`)).toHaveLength(0);
    await expect(as('stranger@example.com', `insert into realtime.messages (topic, extension, event) values ('cellmates', 'broadcast', 'invite')`)).rejects.toThrow(/row-level security/);
  });
});

describe('solving and playing again', () => {
  it('records a solve and marks the board solved', async () => {
    await as(YSL, `select public.record_solve('p5-heart', 0, 'Heart', 5::smallint, null, 61, '..0..', true)`);
    const [s] = await as<{ solved_by: number; seconds: number }>(JOEL, `select solved_by, seconds from public.solves`);
    expect([s.solved_by, s.seconds]).toEqual([1, 61]);
    expect((await as<{ solved: boolean }>(JOEL, `select solved from public.boards`))[0].solved).toBe(true);
  });

  it('play again clears cells once, even if both press it', async () => {
    expect((await as<{ reset_board: number }>(JOEL, `select public.reset_board('p5-heart', 0)`))[0].reset_board).toBe(1);
    await apply(JOEL, [move(0, 1, 0, 700)], 1);
    // YSL pressed Play again on the old round; it must not wipe Joel's new move.
    expect((await as<{ reset_board: number }>(YSL, `select public.reset_board('p5-heart', 0)`))[0].reset_board).toBe(1);
    expect((await cells()).map((c) => c.idx)).toEqual([0]);
    const [b] = await as<{ round: number; solved: boolean; seconds: number }>(JOEL, `select round, solved, seconds from public.boards`);
    expect([b.round, b.solved]).toEqual([1, false]);
  });

  it('ignores moves made before the reset', async () => {
    expect((await apply(YSL, [move(2, 1, 1, 999)], 0))[0].apply_moves).toBe(1);
    expect((await cells()).map((c) => c.idx)).toEqual([0]);
  });
});
