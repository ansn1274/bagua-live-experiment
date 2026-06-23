-- Supabase schema for the public/statistical part of the live experiment.
-- Do not add columns for private question text, generated prompts, raw GPT JSON,
-- statement text, or personal divination feedback.

-- The current app persists the public experiment state through this JSON snapshot
-- so Vercel + Supabase can run the live event immediately. The normalized tables
-- below mirror the intended analytical/export shape and can be used for a stricter
-- event-sourced backend later.
create table if not exists app_state (
  key text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  title text not null,
  active_round_id text not null,
  current_stage text not null,
  allowed_pages jsonb not null default '[]'::jsonb,
  reveal_enabled boolean not null default false,
  sweep_open boolean not null default false,
  sweep_plum_density int not null default 260,
  sweep_leaf_density int not null default 330,
  quiz_question_seconds int not null default 15,
  show_screen_panel boolean not null default false,
  round_index int not null default 1,
  practice_step int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists rounds (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  round_index int not null,
  title text not null,
  quiz_collects_distracted_numbers boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists participants (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  recovery_code_hash text,
  nickname text,
  consented boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists participant_progress (
  participant_id text not null references participants(id) on delete cascade,
  round_id text not null references rounds(id) on delete cascade,
  stage_status_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (participant_id, round_id)
);

create table if not exists qa_questions (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  participant_id text references participants(id) on delete set null,
  author_name text,
  anonymous boolean not null default true,
  text text not null,
  likes int not null default 0,
  liked_by jsonb not null default '[]'::jsonb,
  hidden boolean not null default false,
  pinned boolean not null default false,
  answered boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sweep_results (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  plum_count int not null,
  leaf_count int not null,
  found_trigrams_json jsonb not null default '[]'::jsonb,
  elapsed_ms int not null,
  hexagram_summary_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id)
);

create table if not exists quiz_scores (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  display_name text not null,
  score int not null,
  correct_count int not null,
  total_count int not null,
  elapsed_ms int not null,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id)
);

create table if not exists random_sources (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  source_type text not null check (source_type in ('sweep_random', 'focused_true', 'distracted_random', 'focused_reversed')),
  n1 int not null,
  n2 int not null,
  hexagram_summary_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id, source_type)
);

create table if not exists blind_mappings (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  blind_id text not null check (blind_id in ('A', 'B', 'C', 'D')),
  source_type text not null check (source_type in ('sweep_random', 'focused_true', 'distracted_random', 'focused_reversed')),
  created_at timestamptz not null default now(),
  unique (round_id, participant_id, blind_id),
  unique (round_id, participant_id, source_type)
);

create table if not exists parse_summaries (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  parse_ok boolean not null,
  card_count int not null,
  statement_count_each jsonb not null default '[]'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id)
);

create table if not exists rating_summaries (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  blind_id text not null check (blind_id in ('A', 'B', 'C', 'D')),
  checked_count int not null,
  statement_total int not null,
  subjective_score int not null check (subjective_score between 1 and 5),
  bonus_liked boolean not null default false,
  forced_choice boolean not null default false,
  preference_rank int check (preference_rank between 1 and 4),
  created_at timestamptz not null default now(),
  unique (round_id, participant_id, blind_id)
);

alter table events enable row level security;
alter table app_state enable row level security;
alter table rounds enable row level security;
alter table participants enable row level security;
alter table participant_progress enable row level security;
alter table qa_questions enable row level security;
alter table sweep_results enable row level security;
alter table quiz_scores enable row level security;
alter table random_sources enable row level security;
alter table blind_mappings enable row level security;
alter table parse_summaries enable row level security;
alter table rating_summaries enable row level security;

-- For a live talk prototype, create permissive anon policies and restrict admin
-- features in the app by a separate admin passphrase or Supabase Auth.
-- Harden these before using outside controlled classroom/speaking contexts.
