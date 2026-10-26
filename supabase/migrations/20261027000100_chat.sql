-- Chat: one conversation between the two of you.
-- Run this once in the Supabase SQL editor, after the earlier migrations.

create table public.messages (
  -- Made on the phone that writes the message, so resending after a dropped
  -- connection can never create a duplicate.
  id uuid primary key,
  author smallint not null check (author in (0, 1)),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- The puzzle on screen when the message was sent (optional).
  puzzle_id text,
  puzzle_n smallint check (puzzle_n in (5, 10, 15, 20)),
  puzzle_seed bigint,
  created_at timestamptz not null default now()
);
create index messages_created_at on public.messages (created_at desc);

-- One reaction per person per message. emoji null = reaction removed.
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  player smallint not null check (player in (0, 1)),
  emoji text check (emoji in ('❤️', '😂', '👏', '🤔')),
  updated_at timestamptz not null default now(),
  primary key (message_id, player)
);

-- How far each of you has read, for the unread badge (shared across your devices).
create table public.chat_reads (
  player smallint primary key check (player in (0, 1)),
  last_read_at timestamptz not null
);

-- The server decides who wrote a message or reaction, so nobody can post as the other person.
create function public.stamp_author() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'messages' then
    new.author := public.my_player();
    new.created_at := now();
    if new.author is null then raise exception 'Only members can chat' using errcode = '42501'; end if;
  else
    new.player := public.my_player();
    if tg_table_name = 'message_reactions' then new.updated_at := now(); end if;
    if new.player is null then raise exception 'Only members can chat' using errcode = '42501'; end if;
  end if;
  return new;
end $$;

create trigger stamp_author before insert on public.messages
  for each row execute function public.stamp_author();
create trigger stamp_author before insert or update on public.message_reactions
  for each row execute function public.stamp_author();
create trigger stamp_author before insert or update on public.chat_reads
  for each row execute function public.stamp_author();

alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_reads enable row level security;

create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member());
create policy "members write messages" on public.messages
  for insert to authenticated with check (public.is_member());

create policy "members read reactions" on public.message_reactions
  for select to authenticated using (public.is_member());
create policy "members add their own reactions" on public.message_reactions
  for insert to authenticated with check (public.is_member());
create policy "members change their own reactions" on public.message_reactions
  for update to authenticated using (player = public.my_player()) with check (public.is_member());

create policy "members read read-markers" on public.chat_reads
  for select to authenticated using (public.is_member());
create policy "members set their own read-marker" on public.chat_reads
  for insert to authenticated with check (public.is_member());
create policy "members move their own read-marker" on public.chat_reads
  for update to authenticated using (player = public.my_player()) with check (public.is_member());

revoke all on public.messages, public.message_reactions, public.chat_reads from anon;

alter publication supabase_realtime add table public.messages, public.message_reactions, public.chat_reads;
