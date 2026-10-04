-- Rows written before the fix to PostgresStore hold JSON strings (double-encoded JSON) instead of
-- objects. Unwrap them. Safe to run on correct rows: only string values are touched.
update stackprobe.scans
set report = (report #>> '{}')::jsonb
where jsonb_typeof(report) = 'string';

update stackprobe.layer_results
set signals = (signals #>> '{}')::jsonb
where jsonb_typeof(signals) = 'string';

update stackprobe.layer_results
set error = (error #>> '{}')::jsonb
where jsonb_typeof(error) = 'string';
