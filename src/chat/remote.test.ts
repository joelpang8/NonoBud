// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSupabaseChat } from './remote';

const DIR = join(__dirname, '../../supabase/migrations');
const SQL = readdirSync(DIR)
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n');

function columns(table: string): string[] {
  const m = SQL.match(new RegExp(`create table public\\.${table} \\((.*?)\\n\\);`, 's'));
  if (!m) throw new Error(`table ${table} not found`);
  return [...m[1].matchAll(/^\s+(\w+)\s/gm)].map((x) => x[1]).filter((c) => c !== 'primary');
}

function fake(respond: (path: string) => unknown) {
  const calls: { method: string; path: string; query: URLSearchParams; body: unknown }[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, query: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(respond(url.pathname)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { chat: createSupabaseChat(createClient('https://demo.supabase.co', 'k', { global: { fetch }, auth: { persistSession: false } })), calls };
}

describe('Supabase chat calls', () => {
  it('only reads and writes columns that exist in the migration', async () => {
    const { chat, calls } = fake((p) =>
      p.endsWith('/messages') ? [{ id: 'a', author: 1, body: 'hi', puzzle_id: null, puzzle_n: null, puzzle_seed: null, created_at: '2026-10-27T10:00:00Z' }] : [],
    );
    const r = await chat.recent(50);
    expect(r.messages[0]).toMatchObject({ id: 'a', author: 1, body: 'hi', createdAt: Date.parse('2026-10-27T10:00:00Z') });
    await chat.send({ id: 'b', author: 0, body: 'yo', puzzleId: 'p5-heart', puzzleN: 5, puzzleSeed: null, createdAt: 1 });
    await chat.react({ messageId: 'a', player: 0, emoji: '❤️' });
    await chat.read({ player: 0, at: Date.parse('2026-10-27T10:00:00Z') });
    for (const c of calls) {
      const table = c.path.split('/').pop()!;
      const used = [
        ...(c.query.get('select') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        ...(c.body && typeof c.body === 'object' ? Object.keys(c.body as object) : []),
        ...(c.query.get('on_conflict') ?? '').split(',').filter(Boolean),
      ];
      for (const col of used) expect(columns(table), `${table}.${col}`).toContain(col);
    }
    const send = calls.find((c) => c.method === 'POST' && c.path.endsWith('/messages'))!;
    expect(send.query.get('on_conflict')).toBe('id');
  });
});
