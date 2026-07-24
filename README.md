# UWC Energy Monitor

A web-based dashboard and ingestion API for a three-phase energy monitoring system.

## Version 1.5.4: Phase Colour Alignment

The physical UWC units and their firmware are still under development, so this release deliberately does not assume Modbus, MQTT, HTTP, WebSockets, raw TCP, or any other device protocol.

The application now uses a provider architecture:

- `BaseProvider` defines the common adapter interface.
- `DummyProvider` supplies simulated readings through that interface.
- `ProviderFactory` selects the adapter configured for each device.
- `UnconfiguredNetworkProvider` represents future Wi-Fi hardware without guessing its protocol.
- Device status is standardised as Online, Offline, Disabled, Initialising, or Not Configured.

A future adapter only needs to translate its protocol into the application's existing standard measurement object. The dashboard, history database, and device-details page remain independent of the communications method.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The app includes dummy simulator devices by default. The database is runtime data and is created automatically when the application starts.

## Current providers

### Dummy Simulator

Produces smooth simulated three-phase measurements and stores them in SQLite.

### Network Adapter (not configured)

A protocol-neutral placeholder. It accepts an optional local-network host but intentionally does not communicate until the device firmware and protocol are defined.

## Future adapter contract

New providers extend `src/services/baseProvider.js` and implement an asynchronous `read()` method. A successful read returns the common internal measurement shape used by the application.

Provider-specific configuration belongs in `providerOptions`; generic addressing belongs in `connection`. This prevents protocol-specific fields from becoming part of the core device model.

## Existing ingestion endpoint

The authenticated `POST /api/readings` endpoint remains available for testing and for a possible future push-based adapter.

## Important electrical note

This software assumes that the PCB and firmware perform safe isolation, calibration, and validation before transmitting readings. Work on mains circuits must be done by competent electrical professionals and comply with applicable wiring and safety standards.

## Collapsible device section

Version 1.5.2 makes the Devices area on the dashboard collapsible. Select the Devices heading to hide or reveal the device cards. The indicator shows `▼` while expanded and `▶` while collapsed. The selected state is stored locally in the browser and persists through navigation, refreshes and browser restarts. The Add Device action remains available in either state.

## Appearance themes

Version 1.5.1 adds a **Toggle Dark Mode** control in the upper-right of both the dashboard and device details page. The existing interface remains the Light theme. Dark mode uses a very dark blue (`#08182E`) background with contrasting cards and text. The selected theme is stored locally in the browser and persists through navigation, refreshes, Back/Forward actions and browser restarts.

## Standard phase colours

Version 1.5.4 aligns the Device Details interface with the three-phase wiring colour convention used by the project. L1 is red (`#D32F2F`), L2 is yellow (`#FBC02D`), and L3 is blue (`#1976D2`). The same reusable phase colours are applied to the accent bars on the L1, L2 and L3 reading cards and to their matching traces in the device historical power graph. The dashboard Total Power History line remains the application accent colour because it represents a combined value rather than an individual phase.

## Dashboard total power history

Version 1.5.3 adds a 24-hour historical graph to the main dashboard. It combines the latest stored reading from every measured device for each one-second interval and displays one Total Power line in kW. The graph appears below the summary cards and above the Devices area.

The Total Power History and Devices sections can be collapsed independently. Both use `▼` while expanded and `▶` while collapsed, and both save their selected state locally in the browser. The graph is expanded by default for a first-time user and supports the existing Light and Dark themes.
