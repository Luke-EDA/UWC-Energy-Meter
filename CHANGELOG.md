# Changelog

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
