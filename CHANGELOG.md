## v1.9.2 — Simplified Power Measurement
- Derive per-phase displayed power as voltage × current / 1000; total power is the sum of enabled phases. Display unit remains kW by project convention, although this is apparent power (kVA).
- Save valid calibrated and uncalibrated EnergyGuard samples in the standard history pipeline, and retain the raw V/A history.
- Remove frequency and power-factor cards from device details and PDF summaries.
- Stop generating simulated frequency/PF; retain legacy database columns for compatibility.
- Energy (kWh) and tariff amounts are estimates based on apparent power, not measured real energy.

## v1.9.1 — Uncalibrated measurement history update
- Save valid EnergyGuard voltage/current UDP readings independently of calibration or power factor.
- Preserve unknown power as NULL; keep energy and billing history calibrated-only.
- Expose recent raw measurements through `/api/energyguard/history`.
- Correct device-details online state and show N/A for unavailable power, PF and frequency.

## v1.9.1 — EnergyGuard Live UDP Measurements

- Registered EnergyGuard meters now use live UDP voltage/current readings rather than the unconfigured network adapter. Existing v1.9.0 registrations are migrated in memory automatically.
- Simulator history is restricted to dummy devices.
- Offline and invalid broadcast states are exposed by the device manager.
- Uncalibrated readings are visible live but excluded from historical energy and tariff calculations. Calibrated measurements require a firmware-supplied power factor before power/history can be calculated.
- No assumed frequency or power factor is presented as a measured value.

# Changelog

## v1.9.0 - EnergyGuard Auto Discovery
- Listen for validated EnergyGuard announcement broadcasts on UDP 4210.
- Display unregistered, recently detected meters in the Add Device dialog.
- Register selected meters by permanent device ID and exclude registered meters from the discovery list.
- Refresh registered meter IP addresses when new announcements arrive.
- Preserve manual device setup and simulator support; live measurement ingestion is a separate integration step.

## v1.8.0 - Deployment & Network Diagnostics

- Verified local-network access from a separate phone client while the server listens on `0.0.0.0`.
- Added validated `HOST` and `PORT` environment configuration with defaults of `0.0.0.0` and `3000`.
- Added a startup banner that lists localhost and detected LAN access URLs.
- Added `/health` and retained `/api/health`, returning status, version, uptime, bind settings, network addresses and timestamp.
- Added `NETWORK_SETUP.md` with Windows Firewall, ESET, network-profile, connectivity-test, static-IP and security guidance.
- Documented that endpoint-security products can silently block `node.exe` even when the application and Windows Firewall are configured correctly.
- Clarified that v1.8.0 enables trusted-LAN deployment only and does not make the service suitable for direct internet exposure.

## v1.7.2 - Independent Phase Export Pipeline

- Rebuilt device export history preparation around one independent data series per phase.
- A disabled phase now creates gaps only in that phase's PDF line and worksheet rows.
- Enabled phases retain their valid hourly, daily, or weekly averages during another phase's disabled interval.
- Removed shared bucket-validity behaviour from device PDF and worksheet generation.
- Preserved blank values for genuinely missing samples and full-phase disabled buckets without substituting zero or carrying values forward.
- Kept phase-disable availability notes, report axes, units, legends, and Light Mode PDF formatting.

## v1.7.1 - PDF Report Improvements

- Added labelled Y-axis scales with engineering units to exported PDF graphs.
- Added range-aware date and time labels to graph X-axes.
- Added horizontal and vertical grid lines for easier value estimation.
- Added clear axis titles, graph legends, and figure numbering.
- Added the reporting period and averaging resolution beneath each graph.
- Added page-number footers with site name and report-generation timestamp.
- Preserved A4 portrait formatting and the always-Light-Mode PDF design.
- No changes were made to worksheet exports, export ranges, or averaging intervals.
- Corrected exported phase histories so fully disabled reporting buckets remain blank and produce visible graph gaps instead of lines averaged across the disabled interval.
- Added disabled-phase availability periods beneath affected PDF graphs and to device worksheets.
- Corrected phase summary status handling so an enabled phase without a latest sample is shown as No data rather than Disabled.

## v1.7.0 - Data Export

- Added PDF and Excel-compatible worksheet exports to the dashboard and Device Details pages.
- Added Last Week, Last Month, Last 6 Months and Last Year export ranges.
- Export aggregation uses hourly, daily or weekly averages according to the selected reporting range.
- PDF reports use A4 portrait Light Mode formatting regardless of the active application theme.
- Dashboard exports can include individual devices as additional PDF pages or workbook sheets.
- Worksheet layouts place reporting timestamps in columns and phase measurement data in rows.
- Reports identify the selected period and data resolution.

## [1.5.8.2] - Device Energy Usage & Cost Summary

- Corrected the Device Details Energy Usage & Cost card to match the dashboard card structure, spacing, typography, controls, responsive layout, and theme appearance.

### Added
- An Energy Usage & Cost card on the Device Details page.
- Device-specific Current Month, Last Month, Last 6 Months and Last Year selections.
- Device-only kWh integration and tariff-based cost calculation through the existing energy-summary API.

### Changed
- The Device Details page now places accumulated usage and cost below the whole-device overview cards and above the live phase readings.
- Current Month refreshes automatically while completed historical ranges remain static after loading.
- Updated application version and build metadata to 1.5.8.2.

# Changelog

## 1.5.8 - Energy Usage & Cost Summary

- Added a dashboard Energy Usage & Cost card beneath the Live Readings cards.
- Added Current Month, Last Month, Last 6 Months and Last Year calendar-aligned ranges. Last 6 Months and Last Year use the previous 6 or 12 complete calendar months ending at the start of the current month.
- Calculates site-wide energy usage in kWh by integrating stored power readings while avoiding long missing-data gaps.
- Calculates energy cost using the saved v1.5.5 tariff and selected currency.
- Current Month updates continuously; completed historical periods load only when selected.
- Shows the exact local calendar period used for each calculation.
- Displays energy usage even when no tariff is configured.

## 1.5.7.1 - Dark Mode Dropdown Fix

- Fixed graph range dropdown options rendering as white text on a white background in Dark Mode on Windows Chromium-based browsers.
- Added explicit dark backgrounds and high-contrast text colours to the range selector and its native options.
- Added a dark colour-scheme hint for more consistent native menu rendering.
- No changes were made to graph data, range selection behaviour, or persistence.

## 1.5.7 - Graph Range Selection

- Added independent range dropdowns to the dashboard Total Power History graph and Device Details power graph.
- Added selectable ranges for 24 hours, 7 days, 1 month, 6 months and 1 year.
- Kept 24 hours as the default whenever a page is opened or refreshed; range selections are not persisted.
- Added server-side time-window validation and aggregation to keep long-range graphs responsive.
- Added range-aware date labels and full timestamps in chart tooltips.
- Preserved disabled-phase gaps and all existing historical readings across every range.
- Added graph-level loading, empty-data and error messages.

### v1.5.6 hotfix 2
- Fixed active phase cards incorrectly showing the Disabled status.
- Ensured the disabled status is only rendered when a phase is actually disabled.


## 1.5.5 - Site & Tariff Options

- Added an Options button to the main dashboard header.
- Added a responsive, Light/Dark theme-compatible Site Options dialog.
- Added a persistent Site Name setting that appears above the live reading cards and is completely hidden when blank.
- Added a currency selector that defaults to South African Rand (`🇿🇦 ZAR`) and includes ZAR, USD, EUR and GBP.
- Added an optional non-negative Price per kWh setting for future energy-cost calculations.
- Added `GET /api/settings` and `PUT /api/settings` endpoints.
- Stored shared application settings in SQLite so they remain consistent across browsers and computers.
- Added server-side validation for site name, currency and tariff values.

## 1.5.4 - Phase Colour Alignment

- Added reusable application phase colour variables: L1 red (`#D32F2F`), L2 yellow (`#FBC02D`), and L3 blue (`#1976D2`).
- Updated the top accent bars on the Device Details L1, L2 and L3 cards to use the standard phase colours.
- Updated the Device Details historical power graph so each phase trace matches its corresponding card colour.
- Kept the dashboard Total Power History graph on the primary application accent because it represents combined power rather than an individual phase.
- Preserved phase colours in both Light and Dark themes.

## 1.5.3 - Dashboard Total Power History

- Added a 24-hour Total Power History graph to the main dashboard below the summary cards and above the Devices area.
- Added a backend endpoint that aggregates the latest reading from every measured device into one total-power value per second.
- Added a single Total Power line without separate phase lines.
- Made the history graph section independently collapsible with `▼` and `▶` indicators.
- Stored the history section state in browser `localStorage`, independently of the Devices section.
- Added responsive graph sizing, automatic history refresh, and Light/Dark theme support.

## 1.5.2 - Collapsible Device Section

- Added an accessible expand/collapse control to the Devices header on the dashboard.
- Added clear expanded (`▼`) and collapsed (`▶`) indicators.
- Made the full Devices heading area clickable for easier mouse and touch use.
- Added a subtle collapse and fade transition while removing the hidden cards from the page layout.
- Stored the selected section state in browser `localStorage` so it persists across navigation, refreshes and browser restarts.
- Kept the Add Device action visible while the device cards are collapsed.
- Prepared dashboard space for the next v1.5.x element.

## 1.5.1 - Appearance & User Experience

- Added a persistent **Toggle Dark Mode** control to the dashboard and device details page.
- Added sun and moon motifs based on the approved industrial switch concept.
- Added a dark blue theme using `#08182E` as the main page background.
- Added high-contrast dark-theme cards, forms, dialogs, navigation, status panels, tables and chart styling.
- Stored the selected theme in browser `localStorage`.
- Applied the selected theme before page rendering to prevent a light-theme flash.
- Preserved the theme across device-card navigation, dashboard back navigation, browser Back/Forward, refreshes and browser restarts.
- Kept the existing colour scheme unchanged as the official Light mode.

## 1.5.0 - Communications Framework

### Added
- Protocol-agnostic provider interface for device data sources.
- Provider factory for selecting adapters per configured device.
- Network Adapter placeholder that makes no assumptions about the future Wi-Fi protocol.
- Standard provider states: Online, Offline, Disabled, Initialising, Error and Adapter Not Configured.
- Generic `connection` and `providerOptions` configuration objects.
- `GET /api/providers` endpoint for discoverable provider types.

### Changed
- Refactored the Dummy Simulator to use the same provider contract as future hardware adapters.
- Replaced Modbus-specific form fields with Data Provider, optional Network Host and Update Interval.
- Migrated default device configuration to the protocol-neutral schema.
- Dashboard totals now include only providers that are actively Online.
- Device Details retains historical access for disabled, offline and unconfigured devices.
- Updated application version and build metadata to 1.5.0 / Communications Framework.

### Compatibility
- Existing v1.4.x configuration fields are still read and migrated internally.
- Existing API aliases such as `type` and `ipAddress` remain available during the transition.

## 1.4.2 - Disabled Device History

### Fixed
- Disabled device cards remain clickable and continue to open the Device Details page.
- Historical charts and energy summaries remain available while a device is disabled.

### Changed
- Disabled Device Details pages now show a grey Disabled status and No live data instead of attempting a live WebSocket connection.
- No readings are generated or stored while a device remains disabled.
- Updated application version and build metadata to 1.4.2 / Disabled Device History.

## 1.4.1 - Device Configuration

### Added
- Settings control on every device card.
- Reusable device form for editing existing configuration.
- Enable and disable control with a distinct Disabled state and No live data message.
- Confirmed device removal while retaining existing historical readings.
- `PUT /api/devices/:id` and `DELETE /api/devices/:id` endpoints.

### Changed
- Disabled devices remain visible on the dashboard but are excluded from live totals and simulator updates.
- Device configuration changes persist in `src/config/devices.json`.
- Updated application version and build metadata to 1.4.1 / Device Configuration.

## 1.4.0 - Add Device

### Added
- Functional Add Device dialog on the dashboard.
- One-at-a-time device setup for name, device type, IP address or host name, TCP port, Modbus slave ID, poll interval and enabled state.
- `POST /api/devices` endpoint with server-side validation.
- Persistent device configuration in `src/config/devices.json`.
- Immediate creation of a simulator provider and dashboard card after a device is saved.
- Duplicate-name protection and validation feedback in the dialog.

### Changed
- Expanded existing device configuration records with connection settings needed for future Modbus support.
- Disabled devices are excluded from simulator updates and reading storage.
- Updated application version and build metadata to 1.4.0 / Add Device.

### Retained
- Existing dashboard layout and cards.
- Existing Device Details page, history graph and energy summary.
- Dummy Simulator as the only available device type for this milestone.

## 1.3.0 - Device Details

### Added
- Prominent Back to Dashboard navigation button on the device page.
- Selected device name as the device-page title.
- Device-specific live data, history and energy-summary API requests.
- Online connection status and last-update timestamp.
- Power-factor display.
- Dedicated L1, L2 and L3 measurement cards.
- Device Details version footer and responsive layout.
- Filtering of WebSocket readings so only the selected device updates the page.

### Changed
- Redesigned the existing monitoring page into a clearer industrial device view.
- Updated application version and build metadata to 1.3.0 / Device Details.
- Updated dashboard version labels to 1.3.0.

### Retained
- Existing 24-hour graph.
- Existing energy-consumption summary.
- Existing multi-device dashboard and Add Device placeholder.

## 1.2.0 - Dashboard

### Added
- Multi-device dashboard as the application landing page.
- System summary tiles and live device cards.
- Click-through navigation to the device details page.
- Add Device placeholder dialog.

## [1.5.6] - Phase Line Configuration

### Added
- Per-device optional labels for L1, L2 and L3.
- An **Edit Phase Lines** dialog on the Device Details page.
- Independent metering enable/disable controls for every phase.
- Confirmation before one or more active phases are disabled.
- Phase-coloured label inputs matching the L1, L2 and L3 display accents.
- Persistent phase configuration and phase enable/disable event timestamps.

### Changed
- Disabled phase cards remain visible and show a compact disabled status.
- Live totals and new energy summaries exclude disabled phases.
- Historical phase data remains visible after a phase is disabled.
- Disabled intervals appear as graph gaps rather than false zero readings.
- New readings are stored in phase-normalised tables, so disabled phases do not create measurement records.