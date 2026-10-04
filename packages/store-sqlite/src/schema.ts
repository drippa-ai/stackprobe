// Each entry upgrades the database by one version, tracked in SQLite's user_version.
// Append only: never edit a migration that has shipped.
export const MIGRATIONS: string[] = [
  `
  create table scans (
    id text primary key,
    domain text not null,
    url text not null,
    status text not null check (status in ('running', 'done', 'partial')),
    created_at text not null,
    finished_at text,
    fingerprints_version text,
    report text
  );
  create index scans_domain_created_at on scans (domain, created_at desc);

  -- Raw signals from each layer, kept so new fingerprints can be run on old scans.
  create table layer_results (
    scan_id text not null references scans (id) on delete cascade,
    surface_id text not null,
    layer text not null,
    status text not null,
    duration_ms integer not null,
    error text,
    signals text not null,
    primary key (scan_id, surface_id, layer)
  );

  -- One row per finished detection, for questions across scans.
  create table detections (
    scan_id text not null references scans (id) on delete cascade,
    surface_url text not null,
    tech text not null,
    category text not null,
    version text,
    confidence real not null,
    primary key (scan_id, surface_url, tech)
  );
  create index detections_tech on detections (tech, confidence);
  `,
];
