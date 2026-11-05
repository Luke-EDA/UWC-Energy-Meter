# v2.3.0 — Release Build

- Include synchronized EnergyGuard C4D history in device and site PDF/Excel exports.
- Prefer direct live samples when a synchronized record overlaps a direct sample within the same 10-second window.
- Include recovered power samples in site totals, energy estimates, and last available readings.
- Recovered C4D samples have no voltage magnitude; voltage cells remain blank unless a direct measurement is available.
- Update dashboard and device-page version badges to v2.3.0.
- Update package, lockfile and VERSION metadata to 2.3.0; buildName: Release Build.

Note: recovered device history is limited by the meter firmware history buffer and successful synchronization. Energy estimates are calculated from available samples, not extrapolated across gaps longer than 15 minutes.

## Graph/export consistency update
- Export charts use the same history bucket sizes as frontend charts: 7 days = 15 minutes; 1 month = 1 hour; 6 months and 1 year = 1 day.
- Site dashboard and PDF/XLSX charts now share the same SQL for combining direct and recovered EGM measurements.
- Frontend phase and site graphs use straight node-to-node lines (no curve smoothing).
- Note: tariff summary and historical export may cover different periods; their kWh totals should only be compared with matching date windows.
