alter table public.rooms
  add column topic text not null default '' check (char_length(topic) <= 120),
  add column scope text not null default '' check (char_length(scope) <= 4000);