## v2.1.3 — Live device-details phase-card refresh (testing)
- Refresh enabled device-details L1/L2/L3 voltage, current and power cards from `/api/latest` every five seconds without reloading the page.
- Prevent overlapping refresh requests and stale WebSocket messages from overwriting newer readings.
- Display N/A for missing phase values while retaining the v2.1.1 zero-reading convention for online voltage-valid phases.
- Keep existing history chart refresh and selected range independent of the live-card refresh.
- Preserve the verified C4D history pagination workaround (20 records per request) in both the caller and default.

