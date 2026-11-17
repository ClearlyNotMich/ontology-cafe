-- Ontology Café schema. No auth by design: anyone with a room link plays.
-- Data is non-sensitive group brainstorming, so anon has full access, scoped in the app by room_id.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4,8}$'),
  host_id uuid,
  cs_phase text not null default 'write' check (cs_phase in ('write', 'sort')),
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key, -- generated in the browser and kept in localStorage
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.piles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null default 'New pile' check (char_length(name) <= 80),
  color text not null default 'amber',
  reason text not null default '' check (char_length(reason) <= 1000),
  collapsed boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id uuid references public.players(id) on delete set null,
  co_author_ids uuid[] not null default '{}',
  text text not null check (char_length(text) between 1 and 120),
  note text not null default '' check (char_length(note) <= 500),
  pile_id uuid references public.piles(id) on delete set null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_pile_id uuid not null references public.piles(id) on delete cascade,
  to_pile_id uuid not null references public.piles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  reason text not null default '' check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  text text not null check (char_length(text) <= 300),
  created_at timestamptz not null default now()
);

create table public.tq_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  number integer not null,
  barista_id uuid references public.players(id) on delete set null,
  concept text check (char_length(concept) <= 120),
  status text not null default 'picking' check (status in ('picking', 'playing', 'guessed', 'stumped')),
  winner_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.tq_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.tq_rounds(id) on delete cascade,
  asker_id uuid references public.players(id) on delete set null,
  kind text not null default 'question' check (kind in ('question', 'guess')),
  text text not null check (char_length(text) between 1 and 200),
  answer text check (answer in ('yes', 'no', 'sometimes', 'out_of_scope')),
  correct boolean,
  tag text check (tag in ('class', 'property')),
  created_at timestamptz not null default now()
);

create index on public.players (room_id);
create index on public.piles (room_id);
create index on public.cards (room_id);
create index on public.links (room_id);
create index on public.events (room_id, created_at);
create index on public.tq_rounds (room_id);
create index on public.tq_questions (round_id);

do $$
declare t text;
begin
  foreach t in array array['rooms','players','piles','cards','links','events','tq_rounds','tq_questions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Public room access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('alter table public.%I replica identity full', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;