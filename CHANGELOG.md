# Changelog

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
