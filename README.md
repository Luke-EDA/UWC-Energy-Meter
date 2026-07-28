# UWC Energy Monitor

A web-based dashboard and ingestion API for a three-phase energy monitoring system.

## Version 1.6.0: Finalise UI improvements

Version 1.6.0 marks the completion of the UI updates and changes.

## Version 1.5.8.2: Device Energy Usage & Cost Summary

Version 1.5.8.2 extends the Energy Usage & Cost Summary to the Device Details page, allowing the usage and estimated cost of an individual device to be checked using the same tariff saved in Site Options. The site-wide dashboard summary remains unchanged. The selectable periods are Current Month, Last Month, Last 6 Months and Last Year, aligned to local calendar-month boundaries. Last 6 Months and Last Year cover the previous 6 or 12 complete calendar months ending on the final day of the previous month. Current Month refreshes continuously; completed periods remain static until selected again.

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

Version 1.5.5 adds shared site and tariff configuration to the main dashboard. The new Options dialog stores a Site Name, currency and optional Price per kWh in SQLite. South African Rand (`🇿🇦 ZAR`) is selected by default. A configured site name is shown between the main header and the live reading cards; when the field is blank, the site-name area is removed completely. Currency and tariff values are retained for future energy-cost calculations.

## Site and tariff options

- Open **Options** from the dashboard header.
- Enter an optional Site Name.
- Choose a currency; ZAR is the default.
- Enter an optional non-negative Price per kWh.
- Select **Save Options** to update the dashboard immediately.
- Settings are stored centrally in SQLite and are shared by all browsers using the monitor.

## Dashboard total power history

Version 1.5.3 adds a 24-hour historical graph to the main dashboard. It combines the latest stored reading from every measured device for each one-second interval and displays one Total Power line in kW. The graph appears below the summary cards and above the Devices area.

The Total Power History and Devices sections can be collapsed independently. Both use `▼` while expanded and `▶` while collapsed, and both save their selected state locally in the browser. The graph is expanded by default for a first-time user and supports the existing Light and Dark themes.


## Graph range selection (v1.5.7)

Every historical graph includes its own temporary range selector with **24 hours**, **7 days**, **1 month**, **6 months**, and **1 year** options. Each selector defaults to 24 hours whenever the page is opened or refreshed and is intentionally not saved. Longer periods are aggregated by the server for responsive rendering, while disabled phase intervals remain true gaps instead of false zero readings.

## Phase line configuration (v1.5.6)

Each configured meter has independent settings for L1, L2 and L3. On the Device Details page, select **Edit Phase Lines** to add an optional label or enable/disable metering for a phase. Labels are displayed as, for example, `L1 - Kitchen` throughout the phase cards, energy summary headings and graph legend.

Disabling a phase requires confirmation. Existing history is preserved and remains visible, while no new measurement records are stored for that phase. The disabled interval is represented as a gap in the graph, keeping a genuine zero-power reading distinct from metering being switched off. Re-enabling a phase resumes collection without requiring confirmation.
