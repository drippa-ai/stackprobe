-- Scans are only ever added. A scan is updated once, when it finishes, and never again.
create table stackprobe.scans (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  url text not null,
  status text not null default 'running' check (status in ('running', 'done', 'partial')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  fingerprints_version text,
  report jsonb
);

create index scans_domain_created_at on stackprobe.scans (domain, created_at desc);

-- Raw signals from each layer, kept so new fingerprints can be run on old scans.
create table stackprobe.layer_results (
  scan_id uuid not null references stackprobe.scans (id) on delete cascade,
  surface_id text not null,
  layer text not null,
  status text not null,
  duration_ms integer not null,
  error jsonb,
  signals jsonb not null,
  primary key (scan_id, surface_id, layer)
);

-- One row per finished detection, for questions across scans ("which apps use Supabase?").
-- The full evidence stays in scans.report.
create table stackprobe.detections (
  scan_id uuid not null references stackprobe.scans (id) on delete cascade,
  surface_url text not null,
  tech text not null,
  category text not null,
  version text,
  confidence real not null,
  primary key (scan_id, surface_url, tech)
);

create index detections_tech on stackprobe.detections (tech, confidence);

-- No policies: only the database owner (the server) can read or write. Nothing in this schema
-- is reachable through Supabase's public Data API.
alter table stackprobe.scans enable row level security;
alter table stackprobe.layer_results enable row level security;
alter table stackprobe.detections enable row level security;
