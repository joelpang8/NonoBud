// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSupabaseRemote } from './supabaseRemote';
import { OfflineError } from './types';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');
const SQL = readdirSync(MIGRATIONS)
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n');

/** Parameter names of a SQL function in the migration, e.g. apply_moves -> [p_puzzle_id, …]. */
function sqlParams(fn: string): string[] {
  const m = SQL.match(new RegExp(`create function public\\.${fn}\\(([^)]*)\\)`, 's'));
  if (!m) throw new Error(`function ${fn} not found in migrations`);
  return [...m[1].matchAll(/\b(p_\w+)\b/g)].map((x) => x[1]);
}

/** Columns of a table in the migration. */
function sqlColumns(table: string): string[] {
  const m = SQL.match(new RegExp(`create table public\\.${table} \\((.*?)\\n\\);`, 's'));
  if (!m) throw new Error(`table ${table} not found`);
  const added = [...SQL.matchAll(new RegExp(`alter table public\\.${table} add column (\\w+)`, 'g'))].map((x) => x[1]);
  return [...m[1].matchAll(/^\s+(\w+)\s/gm)].map((x) => x[1]).filter((c) => c !== 'primary').concat(added);
}

interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

function fakeSupabase(respond: (r: Recorded) => unknown) {
  const calls: Recorded[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const r: Recorded = { method: init?.method ?? 'GET', path: url.pathname, query: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(r);
    const data = respond(r);
    if (data instanceof Error) throw data;
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const sb = createClient('https://demo.supabase.co', 'public-key', { global: { fetch }, auth: { persistSession: false } });
  return { remote: createSupabaseRemote(sb), calls };
}

describe('Supabase remote', () => {
  it('calls apply_moves with exactly the parameters the SQL function takes', async () => {
    const { remote, calls } = fakeSupabase(() => 0);
    const round = await remote.applyMoves({ kind: 'moves', puzzleId: 'p5-heart', n: 5, round: 0, seconds: 12.7, moves: [{ i: 1, s: 1, o: 0, v: 5 }] });
    expect(round).toBe(0);
    expect(calls[0].path).toBe('/rest/v1/rpc/apply_moves');
    const body = calls[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(sqlParams('apply_moves').sort());
    expect(body).toMatchObject({ p_puzzle_id: 'p5-heart', p_seed: null, p_seconds: 12, p_moves: [{ i: 1, s: 1, o: 0, v: 5 }] });
  });

  it('calls record_solve and reset_board with the SQL parameter names', async () => {
    const { remote, calls } = fakeSupabase((r) => (r.path.endsWith('reset_board') ? 3 : null));
    await remote.recordSolve({
      kind: 'solve',
      puzzleId: 'r10-7',
      round: 2,
      record: { puzzleId: 'r10-7', name: 'Random 10×10', n: 10, seed: 7, seconds: 90, owners: '01', together: true, solvedAt: 1 },
    });
    expect(Object.keys(calls[0].body as object).sort()).toEqual(sqlParams('record_solve').sort());
    expect(await remote.resetBoard({ kind: 'reset', puzzleId: 'r10-7', fromRound: 2 })).toBe(3);
    expect(Object.keys(calls[1].body as object).sort()).toEqual(sqlParams('reset_board').sort());
  });

  it('only asks for columns that exist, and maps rows to app records', async () => {
    const { remote, calls } = fakeSupabase((r) =>
      r.path.endsWith('/boards')
        ? [{ puzzle_id: 'r5-9', n: 5, seed: 9, round: 1, seconds: 30, solved: false, updated_at: '2026-10-25T10:00:00Z' }]
        : [{ puzzle_id: 'p5-heart', name: 'Heart', n: 5, seed: null, seconds: 61, owners: '..0..', together: false, solved_at: '2026-10-25T11:00:00Z' }],
    );
    expect(await remote.listBoards()).toEqual([{ puzzleId: 'r5-9', n: 5, seed: 9, round: 1, seconds: 30, solved: false, updatedAt: Date.parse('2026-10-25T10:00:00Z') }]);
    expect((await remote.listSolves())[0]).toMatchObject({ puzzleId: 'p5-heart', seed: undefined, solvedAt: Date.parse('2026-10-25T11:00:00Z') });
    for (const c of calls) {
      const table = c.path.split('/').pop()!;
      const cols = (c.query.get('select') ?? '').split(',').map((s) => s.trim());
      for (const col of cols) expect(sqlColumns(table)).toContain(col);
    }
  });

  it('loads one board with its cells', async () => {
    const { remote, calls } = fakeSupabase((r) =>
      r.path.endsWith('/boards')
        ? { puzzle_id: 'p5-heart', n: 5, seed: null, round: 0, seconds: 3, solved: false, updated_at: '2026-10-25T10:00:00Z' }
        : [{ idx: 2, state: 1, owner: 1, ver: '1761400000000000' }],
    );
    const b = await remote.getBoard('p5-heart');
    expect(b.meta?.puzzleId).toBe('p5-heart');
    expect(b.cells).toEqual([{ idx: 2, state: 1, owner: 1, ver: 1761400000000000 }]);
    expect(calls.map((c) => c.query.get('puzzle_id'))).toEqual(['eq.p5-heart', 'eq.p5-heart']);
    for (const c of calls) {
      const cols = (c.query.get('select') ?? '').split(',').map((s) => s.trim());
      for (const col of cols) expect(sqlColumns(c.path.split('/').pop()!)).toContain(col);
    }
  });

  it('reports a dropped connection as offline, not as a failure', async () => {
    // (Reads are also retried a few times by supabase-js itself before giving up; writes are not.)
    const { remote } = fakeSupabase(() => new TypeError('Failed to fetch'));
    await expect(remote.applyMoves({ kind: 'moves', puzzleId: 'x', n: 5, round: 0, seconds: 0, moves: [] })).rejects.toBeInstanceOf(OfflineError);
  });
});
