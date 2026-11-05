# v2.1.0 — EnergyGuard live HTTP pilot
- Retained v2.0.0 dashboard, UDP discovery, device registration, simulator and existing history routes.
- New Node.js EnergyGuard HTTP adapter fetches `/api/v1/measurements`, `/api/v1/instantaneous` and `/api/v1/energy`.
- Measured ADE9000 active power replaces the legacy V×A estimate for EnergyGuard.
- Valid phases are recorded into the existing SQLite history and WebSocket reading stream.
- Dashboard device cards show provisional software energy Wh and N/A for invalid phase readings.
- `/api/latest` returns measured per-phase W/var/VA/PF/frequency and software energy details.
- Firmware C4D and calibration remain future work.
- Neutral status for online EnergyGuard devices is shown as Present (inferred from operating L1–N supply); offline status is Unknown. Existing simulator behavior is unchanged.
