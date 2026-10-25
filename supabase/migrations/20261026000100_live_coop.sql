-- Phase 4: live co-op.
-- Run this once in the Supabase SQL editor, after the first migration.

-- Each cell remembers which round it belongs to, so a live update can never be
-- mixed into a board that one of you has just restarted with "Play again".
alter table public.board_cells add column round integer not null default 0;

create or replace function public.apply_moves(
  p_puzzle_id text,
  p_n smallint,
  p_seed bigint,
  p_round integer,
  p_seconds integer,
  p_moves jsonb
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  me smallint := public.my_player();
  cur_round integer;
begin
  if me is null then
    raise exception 'Only members can save moves' using errcode = '42501';
  end if;

  insert into public.boards as b (puzzle_id, n, seed, round, seconds)
  values (p_puzzle_id, p_n, p_seed, p_round, greatest(p_seconds, 0))
  on conflict (puzzle_id) do update
    set seconds = case when b.round = p_round then greatest(b.seconds, excluded.seconds) else b.seconds end,
        updated_at = now()
  returning b.round into cur_round;

  if cur_round <> p_round then
    return cur_round;
  end if;

  insert into public.board_cells as c (puzzle_id, idx, state, owner, ver, writer, round)
  select distinct on (m.i) p_puzzle_id, m.i, m.s, m.o, m.v, me, p_round
  from jsonb_to_recordset(p_moves) as m (i smallint, s smallint, o smallint, v bigint)
  order by m.i, m.v desc
  on conflict (puzzle_id, idx) do update
    set state = excluded.state, owner = excluded.owner, ver = excluded.ver, writer = excluded.writer, round = excluded.round
    where (excluded.ver, excluded.writer) > (c.ver, c.writer);

  return cur_round;
end $$;

-- Send changes to these tables to open apps as they happen (row-level security still applies).
alter publication supabase_realtime add table public.boards, public.board_cells;

-- "Who's online" and invites use a private realtime channel. Only members may use it.
create policy "members can receive live presence and invites" on realtime.messages
  for select to authenticated using (public.is_member());
create policy "members can send live presence and invites" on realtime.messages
  for insert to authenticated with check (public.is_member());
