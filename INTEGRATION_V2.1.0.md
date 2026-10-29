# UWC Energy Monitor v2.1.0 — EnergyGuard HTTP pilot

## Upgrade safely
1. Back up your current v2.0.0 folder, `src/config/devices.json` and the SQLite database before extracting or replacing files. The ZIP includes the v2.0.0 example `devices.json`; **do not overwrite your existing registered devices**.
2. Create a Git branch: `git switch -c feature/v2.1.0-energyguard-http` from the current main branch.
3. Apply the updated source files, preserving your existing configuration and database.
4. Run `npm install` (or `npm ci`) then `npm start`. No ESP32 firmware update is needed.
5. Keep the Node.js machine and EnergyGuard on the same reachable LAN. Discovery uses UDP 4210, measurement HTTP uses the discovered meter's port (usually 80).
6. Register the EnergyGuard from the existing discovery/Add Device interface. Existing registered EnergyGuard devices will use HTTP automatically.

## Expected behavior
- Node.js polls `/api/v1/measurements`, `/api/v1/instantaneous`, `/api/v1/energy` on each registered EnergyGuard.
- Active power comes from ADE9000 `active_power_w`, **not** V×A. Per-phase invalid values are shown as N/A.
- Existing SQLite power-history tables receive only valid phases, at the configured poll interval. Existing simulator remains supported.
- The device card shows provisional accumulated energy in Wh. `/api/latest?deviceId=<registered name>` exposes per-phase PF, reactive power, frequency and energy fields.
- A power reading is accepted if at least one enabled phase has valid voltage, current and active power. Three-phase totals are partial when phases are unavailable; do not interpret as complete site totals.
- All values remain provisional and uncalibrated. EnergyGuard software energy persistence across firmware upgrades remains unresolved. Do not use these readings for billing.

## Verification
PowerShell (replace device name with the one registered in the dashboard):

```powershell
$ip = '192.168.0.155'
Invoke-RestMethod "http://$ip/api/v1/instantaneous" | ConvertTo-Json -Depth 8
Invoke-RestMethod 'http://localhost:3000/api/devices' | ConvertTo-Json -Depth 6
Invoke-RestMethod ('http://localhost:3000/api/latest?deviceId=' + [uri]::EscapeDataString('YOUR ENERGYGUARD NAME')) | ConvertTo-Json -Depth 6
Invoke-RestMethod 'http://localhost:3000/api/recording-status'
```

Test with toaster off and on. L1 power should transition from N/A to approximately 0.38 kW with the previously tested setup; the exact value is not calibrated. Verify history graph points appear only while a valid signal is present. Test dummy devices too.

## Known pilot limitations
- Current dashboard cost/energy summaries use historical power estimates and are not billing grade.
- EnergyGuard `/api/v1/energy` counter can reset after a firmware update; the dashboard labels it provisional.
- HTTP read requires all three endpoints to respond; a failure marks the meter offline until the next successful poll.
- The existing database schema does not yet store per-phase reactive power, PF or energy over time. Those are exposed in the live `/api/latest` payload.
- Hardware energy register `/api/v1/energy/hardware` is deliberately not used as a cumulative counter (C4D pending).

## Neutral status interpretation
For online EnergyGuard devices the device-details page shows **Present**, inferred from the operating L1–N supply. This is not an independent neutral-integrity test or a neutral-current measurement. When offline or disabled, status is **Unknown**. Simulated devices retain their existing neutral behavior. Historical EnergyGuard rows now record the inferred present status for newly collected samples; old rows are not rewritten.
