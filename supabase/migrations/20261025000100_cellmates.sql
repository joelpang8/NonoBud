-- Cellmates database: who may sign in, shared boards, per-cell moves, and finished puzzles.
-- Run this once in the Supabase SQL editor (see README, "Set up Supabase").

-- ===========================================================================
-- The guest list. Exactly two rows: player 0 = Joel (rose), player 1 = YSL (teal).
-- Only the Supabase dashboard can change it (there are no write policies).
-- ===========================================================================
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  player smallint not null unique check (player in (0, 1)),
  display_name text not null
);

create function public.current_email() returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- security definer so the check can read the guest list even though RLS hides it from outsiders.
create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.allowed_emails where email = public.current_email())
$$;

create function public.my_player() returns smallint
language sql stable security definer set search_path = '' as $$
  select player from public.allowed_emails where email = public.current_email()
$$;

alter table public.allowed_emails enable row level security;
create policy "members can read the guest list" on public.allowed_emails
  for select to authenticated using (public.is_member());

-- Refuse to create (or rename to) any account whose email is not on the guest list.
create function public.enforce_allowed_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'This app is private and % is not on the guest list.', new.email
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger enforce_allowed_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_allowed_email();

-- ===========================================================================
-- Boards: one shared board per puzzle.
-- `round` goes up on "Play again" so moves made before the reset are ignored.
-- ===========================================================================
create table public.boards (
  puzzle_id text primary key,
  n smallint not null check (n in (5, 10, 15, 20)),
  seed bigint,
  round integer not null default 0,
  seconds integer not null default 0 check (seconds >= 0),
  solved boolean not null default false,
  updated_at timestamptz not null default now()
);

-- One row per touched cell. Last write wins per cell, decided by `ver`
-- (a clock value from the device that made the move), ties broken by `writer`.
create table public.board_cells (
  puzzle_id text not null references public.boards (puzzle_id) on delete cascade,
  idx smallint not null check (idx >= 0 and idx < 400),
  state smallint not null check (state in (0, 1, 2)),   -- 0 blank, 1 filled, 2 marked X
  owner smallint check (owner in (0, 1)),               -- whose color a filled cell shows
  ver bigint not null,
  writer smallint not null check (writer in (0, 1)),    -- who made this move
  primary key (puzzle_id, idx)
);

-- The latest finished solve of each puzzle (shown in the level list and gallery).
create table public.solves (
  puzzle_id text primary key,
  name text not null,
  n smallint not null check (n in (5, 10, 15, 20)),
  seed bigint,
  seconds integer not null check (seconds >= 0),
  owners text not null,       -- '0'/'1' per filled cell, '.' for blank
  together boolean not null,
  solved_by smallint check (solved_by in (0, 1)),
  solved_at timestamptz not null default now()
);

alter table public.boards enable row level security;
alter table public.board_cells enable row level security;
alter table public.solves enable row level security;

create policy "members share boards" on public.boards
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members share cells" on public.board_cells
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members share solves" on public.solves
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- Logged-out visitors get nothing at all.
revoke all on public.allowed_emails, public.boards, public.board_cells, public.solves from anon;

-- How much each player has filled on each board.
create view public.board_progress with (security_invoker = true) as
  select b.puzzle_id,
         count(c.idx) filter (where c.state = 1 and c.owner = 0) as filled_by_joel,
         count(c.idx) filter (where c.state = 1 and c.owner = 1) as filled_by_ysl
  from public.boards b
  left join public.board_cells c on c.puzzle_id = b.puzzle_id
  group by b.puzzle_id;
revoke all on public.board_progress from anon;

-- ===========================================================================
-- apply_moves: save a batch of cell changes with last-write-wins per cell.
-- Creates the board on first use. Returns the board's current round; if it
-- differs from p_round the board was reset and these moves were ignored.
-- ===========================================================================
create function public.apply_moves(
  p_puzzle_id text,
  p_n smallint,
  p_seed bigint,
  p_round integer,
  p_seconds integer,
  p_moves jsonb            -- [{ "i": idx, "s": state, "o": owner|null, "v": ver }, ...]
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

  insert into public.board_cells as c (puzzle_id, idx, state, owner, ver, writer)
  select distinct on (m.i) p_puzzle_id, m.i, m.s, m.o, m.v, me
  from jsonb_to_recordset(p_moves) as m (i smallint, s smallint, o smallint, v bigint)
  order by m.i, m.v desc
  on conflict (puzzle_id, idx) do update
    set state = excluded.state, owner = excluded.owner, ver = excluded.ver, writer = excluded.writer
    where (excluded.ver, excluded.writer) > (c.ver, c.writer);

  return cur_round;
end $$;

-- Record a finished puzzle and mark its board solved (only if nobody reset it meanwhile).
create function public.record_solve(
  p_puzzle_id text,
  p_round integer,
  p_name text,
  p_n smallint,
  p_seed bigint,
  p_seconds integer,
  p_owners text,
  p_together boolean
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if public.my_player() is null then
    raise exception 'Only members can record solves' using errcode = '42501';
  end if;
  update public.boards set solved = true, seconds = greatest(seconds, p_seconds), updated_at = now()
    where puzzle_id = p_puzzle_id and round = p_round;
  insert into public.solves (puzzle_id, name, n, seed, seconds, owners, together, solved_by, solved_at)
  values (p_puzzle_id, p_name, p_n, p_seed, p_seconds, p_owners, p_together, public.my_player(), now())
  on conflict (puzzle_id) do update
    set name = excluded.name, seconds = excluded.seconds, owners = excluded.owners,
        together = excluded.together, solved_by = excluded.solved_by, solved_at = excluded.solved_at;
end $$;

-- "Play again": clear the board and start a new round. Returns the new round.
-- If someone already reset it (p_round is stale), nothing is cleared twice.
create function public.reset_board(p_puzzle_id text, p_round integer) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  next_round integer;
begin
  if public.my_player() is null then
    raise exception 'Only members can reset boards' using errcode = '42501';
  end if;
  update public.boards set round = round + 1, seconds = 0, solved = false, updated_at = now()
    where puzzle_id = p_puzzle_id and round = p_round
    returning round into next_round;
  if next_round is null then
    select round into next_round from public.boards where puzzle_id = p_puzzle_id;
    return coalesce(next_round, 0);
  end if;
  delete from public.board_cells where puzzle_id = p_puzzle_id;
  return next_round;
end $$;

revoke execute on function public.apply_moves, public.record_solve, public.reset_board from public, anon;
grant execute on function public.apply_moves, public.record_solve, public.reset_board to authenticated;
