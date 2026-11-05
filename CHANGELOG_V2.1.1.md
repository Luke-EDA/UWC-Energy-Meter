# v2.1.1 — EnergyGuard zero-reading handling

- Enabled EnergyGuard phases with valid voltage and `below_threshold_or_absent` current state are mapped to provisional zero current and power in the Node.js provider.
- Zero readings enter SQLite phase history and the live dashboard, allowing graphs to fall to zero.
- Disabled phases and phases with unavailable voltage remain unavailable.
- Failed HTTP polls do not generate zero history samples; device status changes to offline.
- Existing v2.1.0 Neutral indicator behavior is retained.
- Original measurement state and `zeroSubstituted` are retained in provider data for diagnostics.
- No C4D history-buffer fetching yet; that is scheduled for v2.1.2.

## Limitations
Substituted zeros are a display/history convention, not proof of zero consumption or billing-grade data. The raw EnergyGuard measurement table uses zero placeholders for unavailable voltage/current due to legacy NOT NULL columns; use phase_readings for authoritative phase presence.
