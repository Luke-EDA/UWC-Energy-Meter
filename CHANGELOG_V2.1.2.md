# UWC Energy Monitor v2.1.2 — C4D History Synchronization

- Periodic 15-second C4D buffer retrieval, with pagination and persistent boot/sequence cursor.
- SQLite transactionally stores recovered per-phase power/current with quality flags.
- Recovered records participate in phase history, energy summary and tariff calculations, avoiding overlap with live samples in the same 10-second interval.
- Communication failures do not create zero samples; offline devices are not synchronized until online.
- Reboot and overrun events are logged in `egm_sync_events`.
- `GET /api/energyguard/sync-status` exposes synchronization diagnostics.

**Limitations:** C4D provides uptime rather than UTC; recovered timestamps are estimates. RAM history is lost if the EGM itself reboots. C4D history does not provide voltage magnitude. No billing-grade accuracy is claimed. C4D buffer rollover/reboot handling needs on-device validation.
