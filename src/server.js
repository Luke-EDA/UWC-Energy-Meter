'use strict';

/**
 * UWC Energy Meter - Node.js backend
 * Receives 3-phase voltage/current data from PCB/modem over HTTPS/4G,
 * stores readings in SQLite, broadcasts live updates over WebSocket,
 * and serves the browser dashboard.
 */

const path = require('path');
const crypto = require('crypto');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const sqlite3 = require('sqlite3').verbose();
const { WebSocketServer } = require('ws');

const deviceManager = require('./services/deviceManager');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'energy_meter.sqlite');
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || 'change-this-token-before-deployment';
const ENABLE_SIMULATOR = process.env.ENABLE_SIMULATOR !== 'false';

const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    l1_voltage REAL NOT NULL,
    l1_current REAL NOT NULL,
    l1_power_kw REAL NOT NULL,
    l2_voltage REAL NOT NULL,
    l2_current REAL NOT NULL,
    l2_power_kw REAL NOT NULL,
    l3_voltage REAL NOT NULL,
    l3_current REAL NOT NULL,
    l3_power_kw REAL NOT NULL,
    neutral_present INTEGER NOT NULL,
    frequency_hz REAL,
    power_factor REAL,
    total_power_kw REAL NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_readings_device_ts ON readings(device_id, ts)');
});

const app = Fastify({ logger: true });

app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/'
});

function verifyToken(request, reply) {
  const auth = request.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== DEVICE_TOKEN) {
    reply.code(401).send({ error: 'Unauthorized device token' });
    return false;
  }
  return true;
}

function normaliseReading(body) {
  const deviceId = String(body.deviceId || body.device_id || 'uwc-meter-001');
  const ts = Number(body.ts || Date.now());
  const neutralPresent = Boolean(body.neutralPresent ?? body.neutral_present ?? true);
  const frequencyHz = body.frequencyHz ?? body.frequency_hz ?? null;
  const powerFactor = Number(body.powerFactor ?? body.power_factor ?? 1);

  const l1Voltage = Number(body.l1?.voltage ?? body.l1_voltage);
  const l1Current = Number(body.l1?.current ?? body.l1_current);
  const l2Voltage = Number(body.l2?.voltage ?? body.l2_voltage);
  const l2Current = Number(body.l2?.current ?? body.l2_current);
  const l3Voltage = Number(body.l3?.voltage ?? body.l3_voltage);
  const l3Current = Number(body.l3?.current ?? body.l3_current);

  for (const [name, value] of Object.entries({ l1Voltage, l1Current, l2Voltage, l2Current, l3Voltage, l3Current })) {
    if (!Number.isFinite(value)) throw new Error(`Invalid or missing numeric field: ${name}`);
  }

  const l1PowerKw = (l1Voltage * l1Current * powerFactor) / 1000;
  const l2PowerKw = (l2Voltage * l2Current * powerFactor) / 1000;
  const l3PowerKw = (l3Voltage * l3Current * powerFactor) / 1000;
  const totalPowerKw = l1PowerKw + l2PowerKw + l3PowerKw;

  return {
    deviceId, ts,
    l1Voltage, l1Current, l1PowerKw,
    l2Voltage, l2Current, l2PowerKw,
    l3Voltage, l3Current, l3PowerKw,
    neutralPresent: neutralPresent ? 1 : 0,
    frequencyHz,
    powerFactor,
    totalPowerKw
  };
}

function insertReading(r) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO readings (
      device_id, ts,
      l1_voltage, l1_current, l1_power_kw,
      l2_voltage, l2_current, l2_power_kw,
      l3_voltage, l3_current, l3_power_kw,
      neutral_present, frequency_hz, power_factor, total_power_kw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      r.deviceId, r.ts,
      r.l1Voltage, r.l1Current, r.l1PowerKw,
      r.l2Voltage, r.l2Current, r.l2PowerKw,
      r.l3Voltage, r.l3Current, r.l3PowerKw,
      r.neutralPresent, r.frequencyHz, r.powerFactor, r.totalPowerKw
    ], function(err) {
      if (err) return reject(err);
      resolve({ ...r, id: this.lastID });
    });
  });
}

function latestReading(deviceId = 'uwc-meter-001') {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM readings WHERE device_id = ? ORDER BY ts DESC LIMIT 1', [deviceId], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function history(deviceId, hours = 24) {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return new Promise((resolve, reject) => {
    db.all(`SELECT ts, l1_power_kw, l2_power_kw, l3_power_kw, total_power_kw
            FROM readings WHERE device_id = ? AND ts >= ? ORDER BY ts ASC`, [deviceId, since], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

function energySummary(deviceId = 'uwc-meter-001') {
  const periods = [
    { key: 'last24h', label: 'Last 24 hours', hours: 24 },
    { key: 'last7d', label: 'Last 7 days', hours: 24 * 7 },
    { key: 'last1m', label: 'Last 1 month', hours: 24 * 30 },
    { key: 'last6m', label: 'Last 6 months', hours: 24 * 182 },
    { key: 'last12m', label: 'Last 12 months', hours: 24 * 365 }
  ];

  const promises = periods.map(period => new Promise((resolve, reject) => {
    const since = Date.now() - period.hours * 60 * 60 * 1000;
    db.all(`SELECT ts, l1_power_kw, l2_power_kw, l3_power_kw, total_power_kw
            FROM readings WHERE device_id = ? AND ts >= ? ORDER BY ts ASC`, [deviceId, since], (err, rows) => {
      if (err) return reject(err);
      resolve({ period, ...integrateKwh(rows) });
    });
  }));

  return Promise.all(promises);
}

function integrateKwh(rows) {
  if (!rows || rows.length < 2) return { l1Kwh: 0, l2Kwh: 0, l3Kwh: 0, totalKwh: 0 };
  let l1 = 0, l2 = 0, l3 = 0, total = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const hours = Math.max(0, (cur.ts - prev.ts) / 3600000);
    l1 += ((prev.l1_power_kw + cur.l1_power_kw) / 2) * hours;
    l2 += ((prev.l2_power_kw + cur.l2_power_kw) / 2) * hours;
    l3 += ((prev.l3_power_kw + cur.l3_power_kw) / 2) * hours;
    total += ((prev.total_power_kw + cur.total_power_kw) / 2) * hours;
  }
  return { l1Kwh: l1, l2Kwh: l2, l3Kwh: l3, totalKwh: total };
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id,
    ts: row.ts,
    neutralPresent: Boolean(row.neutral_present),
    frequencyHz: row.frequency_hz,
    powerFactor: row.power_factor,
    l1: { voltage: row.l1_voltage, current: row.l1_current, powerKw: row.l1_power_kw },
    l2: { voltage: row.l2_voltage, current: row.l2_current, powerKw: row.l2_power_kw },
    l3: { voltage: row.l3_voltage, current: row.l3_current, powerKw: row.l3_power_kw },
    totalPowerKw: row.total_power_kw
  };
}

function getDevicesApi() {

    return deviceManager.getDevices().map(device => ({

        id: device.id,

        name: device.name,

        enabled: device.enabled,

        type: device.type,

        averageVoltage: device.data.averageVoltage,

        totalCurrent: device.data.totalCurrent,

        totalPower: device.data.totalPower,

        frequency: device.data.frequency,

        lastUpdate: device.data.timestamp

    }));

}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
}

app.post('/api/readings', async (request, reply) => {
  if (!verifyToken(request, reply)) return;
  try {
    const reading = normaliseReading(request.body || {});
    const saved = await insertReading(reading);
    broadcast({ type: 'reading', data: saved });
    return { ok: true, id: saved.id };
  } catch (err) {
    reply.code(400).send({ error: err.message });
  }
});

app.get('/api/devices', async () => {

    return getDevicesApi();

});
app.get('/api/latest', async (request) => rowToApi(await latestReading(request.query.deviceId || 'uwc-meter-001')));
app.get('/api/history', async (request) => history(request.query.deviceId || 'uwc-meter-001', Number(request.query.hours || 24)));
app.get('/api/summary', async (request) => energySummary(request.query.deviceId || 'uwc-meter-001'));
app.get('/api/health', async () => ({ ok: true, service: 'UWC Energy Meter', requestId: crypto.randomUUID() }));

const start = async () => {
  await app.listen({ port: PORT, host: HOST });
};

start().catch(err => {
  app.log.error(err);
  process.exit(1);
});

const server = app.server;
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', data: { service: 'UWC Energy Meter', ts: Date.now() } }));
});

if (ENABLE_SIMULATOR) {

    app.log.info("Starting multi-device simulator...");

    setInterval(async () => {

        const devices = deviceManager.getDevices();

        for (const device of devices) {

            const data = device.data;

            const payload = {

                deviceId: device.name,

                ts: Date.now(),

                neutralPresent: true,

                frequencyHz: data.frequency,

                powerFactor: data.powerFactor,

                l1: {
                    voltage: data.voltage.l1,
                    current: data.current.l1
                },

                l2: {
                    voltage: data.voltage.l2,
                    current: data.current.l2
                },

                l3: {
                    voltage: data.voltage.l3,
                    current: data.current.l3
                }

            };

            try {

                const saved = await insertReading(
                    normaliseReading(payload)
                );

                broadcast({
                    type: "reading",
                    data: saved
                });

            }

            catch (err) {

                app.log.error(err);

            }

        }

    },1000);

}
