# UWC Energy Monitor

A web-based dashboard and ingestion API for a three-phase energy monitoring system.

## Version 1.7.2: PDF Report Improvements

Version 1.7.2 improves exported PDF reports by adding labelled axes, engineering units, readable tick values, range-aware date labels, grid lines, legends, figure numbering, reporting metadata, and page-number footers. PDF reports remain A4 portrait and always use the Light Mode report design. Worksheet exports and export aggregation intervals are unchanged.

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


## Data exports (v1.7.2)

Dashboard and Device Details pages provide PDF and `.xlsx` report generation. Export ranges use report-friendly aggregation: Last Week uses hourly averages, Last Month uses daily averages, and Last 6 Months/Last Year use weekly averages. Dashboard exports may include one page or worksheet per configured device. PDF output is always rendered using the Light Mode report design in A4 portrait format. Exported device histories preserve fully disabled phase intervals as blank buckets, producing clear breaks in PDF trend lines and blank worksheet cells. Affected reports also list the recorded phase-disable periods so intentional metering changes can be distinguished from missing communications data.

After updating from an earlier version, run `npm install` to install the new `pdfkit` and `exceljs` dependencies.

### v1.7.2 export correction

Device export histories are now assembled as independent L1, L2 and L3 series. A disabled or unavailable phase produces a gap only for that phase; other active phases continue to display and export their valid averages for the same reporting intervals.
