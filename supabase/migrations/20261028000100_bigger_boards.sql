-- Allow 25×25 and 30×30 puzzles.
-- Run this once in the Supabase SQL editor, after the earlier migrations.

alter table public.boards drop constraint if exists boards_n_check;
alter table public.boards add constraint boards_n_check check (n in (5, 10, 15, 20, 25, 30));

alter table public.board_cells drop constraint if exists board_cells_idx_check;
alter table public.board_cells add constraint board_cells_idx_check check (idx >= 0 and idx < 900);

alter table public.solves drop constraint if exists solves_n_check;
alter table public.solves add constraint solves_n_check check (n in (5, 10, 15, 20, 25, 30));

alter table public.messages drop constraint if exists messages_puzzle_n_check;
alter table public.messages add constraint messages_puzzle_n_check check (puzzle_n in (5, 10, 15, 20, 25, 30));
