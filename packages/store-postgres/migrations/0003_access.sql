-- API keys. Only a SHA-256 of each key is stored, plus its first characters to tell keys
-- apart; the IP that made it is kept as a keyed hash, never in the clear.
create table stackprobe.api_keys (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,
  prefix text not null,
  ip_hash text not null,
  scans_per_day integer not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index api_keys_ip_created_at on stackprobe.api_keys (ip_hash, created_at);

-- One row per request made with a key, or per scan a website visitor starts. Subjects are
-- "key:<id>" or "visitor:<ip hash>". Rows older than 30 days are deleted.
create table stackprobe.usage (
  id bigint generated always as identity primary key,
  subject text not null,
  endpoint text not null,
  new_scan boolean not null,
  at timestamptz not null default now()
);

create index usage_new_scans on stackprobe.usage (subject, at) where new_scan;
create index usage_at on stackprobe.usage (at);

-- No policies, like the other tables: only the server can read or write.
alter table stackprobe.api_keys enable row level security;
alter table stackprobe.usage enable row level security;
