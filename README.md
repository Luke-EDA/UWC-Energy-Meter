# UWC Energy Meter

A web-based dashboard and ingestion API for a three-phase mains energy monitoring system.

## What it shows

- Live voltage, current and calculated power for Live 1, Live 2 and Live 3
- Neutral presence status
- Total live power in kW
- Consumption summary for the last 24 hours, 7 days, 1 month, 6 months and 12 months
- 24-hour line graph showing L1, L2 and L3 power consumption

## Run locally

```bash
npm install
DEVICE_TOKEN=change-this-token-before-deployment npm start
```

Open: `http://localhost:3000`

The app includes a built-in simulator by default. Disable it with:

```bash
ENABLE_SIMULATOR=false npm start
```

## PCB/modem data post example

```bash
curl -X POST http://localhost:3000/api/readings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-this-token-before-deployment" \
  -d '{
    "deviceId":"uwc-meter-001",
    "neutralPresent":true,
    "frequencyHz":50,
    "powerFactor":0.96,
    "l1":{"voltage":230,"current":36.2},
    "l2":{"voltage":231,"current":30.4},
    "l3":{"voltage":229,"current":41.1}
  }'
```

## Important electrical note

This software assumes that the PCB/firmware performs safe isolation, calibration and validation before transmitting readings. Work on mains circuits must be done by competent electrical professionals and must comply with applicable South African wiring and safety standards.
