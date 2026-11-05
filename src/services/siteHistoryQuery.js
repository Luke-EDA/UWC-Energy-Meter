'use strict';

// Shared by the live dashboard API and PDF/XLSX exports. Directly recorded
// snapshots take precedence over synchronized EGM history in the same 10s slot.
const siteHistorySql = `WITH recovered_totals AS (
  SELECT device_id, ts, SUM(power_kw) AS total_power_kw
  FROM egm_sync_samples GROUP BY device_id, ts
), combined_power AS (
  SELECT device_id, ts, total_power_kw FROM meter_snapshots
  UNION ALL
  SELECT r.device_id, r.ts, r.total_power_kw FROM recovered_totals r
  WHERE NOT EXISTS (
    SELECT 1 FROM meter_snapshots m
    WHERE m.device_id = r.device_id
      AND m.ts >= CAST(r.ts / 10000 AS INTEGER) * 10000
      AND m.ts < CAST(r.ts / 10000 AS INTEGER) * 10000 + 10000
  )
), device_buckets AS (
  SELECT CAST(ts / ? AS INTEGER) AS bucket, device_id,
         AVG(total_power_kw) AS power_kw
  FROM combined_power WHERE ts >= ? AND ts <= ?
  GROUP BY CAST(ts / ? AS INTEGER), device_id
)
SELECT bucket * ? AS ts, SUM(power_kw) AS total_power_kw
FROM device_buckets GROUP BY bucket ORDER BY bucket ASC`;

function siteHistoryParams(bucketMs, startMs, endMs) {
  return [bucketMs, startMs, endMs, bucketMs, bucketMs];
}
module.exports = { siteHistorySql, siteHistoryParams };
