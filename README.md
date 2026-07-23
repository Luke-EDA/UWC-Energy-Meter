# UWC Energy Monitor

A web-based dashboard and ingestion API for a three-phase energy monitoring system.

## Version 1.5.0: Communications Framework

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
