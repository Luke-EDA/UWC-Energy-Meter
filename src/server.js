'use strict';

/**
 * UWC Energy Monitor - Node.js backend
 * Accepts three-phase readings through protocol-independent providers or the
 * ingestion API, stores them in SQLite, broadcasts live updates over WebSocket,
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

// SQLite uses one shared connection for this application. Queue write
// operations so an asynchronous transaction cannot overlap another write or
// attempt to begin a second transaction on the same connection.
let dbWriteQueue = Promise.resolve();

function enqueueDbWrite(operation) {
  const queued = dbWriteQueue.then(operation, operation);
  dbWriteQueue = queued.catch(() => {});
  return queued;
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

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
    total_power_kw REAL NOT NULL,
    UNIQUE(device_id, ts)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_readings_device_ts ON readings(device_id, ts)');
  db.run(`CREATE TABLE IF NOT EXISTS meter_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    neutral_present INTEGER NOT NULL,
    frequency_hz REAL,
    power_factor REAL,
    total_power_kw REAL NOT NULL,
    UNIQUE(device_id, ts)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_snapshots_device_ts ON meter_snapshots(device_id, ts)');
  db.run(`CREATE TABLE IF NOT EXISTS phase_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('l1', 'l2', 'l3')),
    voltage REAL NOT NULL,
    current REAL NOT NULL,
    power_kw REAL NOT NULL,
    UNIQUE(device_id, ts, phase)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_phase_readings_device_phase_ts ON phase_readings(device_id, phase, ts)');
  db.run(`CREATE TABLE IF NOT EXISTS phase_config_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('l1', 'l2', 'l3')),
    enabled INTEGER NOT NULL,
    ts INTEGER NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_phase_events_device_ts ON phase_config_events(device_id, ts)');

  // One-time compatibility migration. Existing v1.5.5 history is copied into
  // the phase-normalised tables, while the legacy readings table is retained.
  db.run(`INSERT OR IGNORE INTO meter_snapshots
          (device_id, ts, neutral_present, frequency_hz, power_factor, total_power_kw)
          SELECT device_id, ts, neutral_present, frequency_hz, power_factor, total_power_kw
          FROM readings`);
  for (const phase of ['l1', 'l2', 'l3']) {
    db.run(`INSERT OR IGNORE INTO phase_readings (device_id, ts, phase, voltage, current, power_kw)
            SELECT device_id, ts, '${phase}', ${phase}_voltage, ${phase}_current, ${phase}_power_kw
            FROM readings`);
  }
  db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    site_name TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'ZAR',
    price_per_kwh REAL
  )`);
  db.run(`INSERT OR IGNORE INTO app_settings (id, site_name, currency, price_per_kwh)
          VALUES (1, '', 'ZAR', NULL)`);
});

const app = Fastify({ logger: true });

app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/'
});


const SUPPORTED_CURRENCIES = new Set(['ZAR', 'USD', 'EUR', 'GBP']);

function getSettings() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT site_name, currency, price_per_kwh FROM app_settings WHERE id = 1`, (err, row) => {
      if (err) return reject(err);
      resolve({
        siteName: row?.site_name || '',
        currency: row?.currency || 'ZAR',
        pricePerKwh: row?.price_per_kwh ?? null
      });
    });
  });
}

function updateSettings(body = {}) {
  const siteName = String(body.siteName ?? '').trim();
  const currency = String(body.currency ?? 'ZAR').trim().toUpperCase();
  const rawPrice = body.pricePerKwh;
  const pricePerKwh = rawPrice === '' || rawPrice === null || rawPrice === undefined
    ? null
    : Number(rawPrice);

  if (siteName.length > 120) throw new Error('Site name must be 120 characters or fewer.');
  if (!SUPPORTED_CURRENCIES.has(currency)) throw new Error('Unsupported currency.');
  if (pricePerKwh !== null && (!Number.isFinite(pricePerKwh) || pricePerKwh < 0)) {
    throw new Error('Price per kWh must be a non-negative number.');
  }

  return enqueueDbWrite(async () => {
    await runDb(`UPDATE app_settings
                 SET site_name = ?, currency = ?, price_per_kwh = ?
                 WHERE id = 1`, [siteName, currency, pricePerKwh]);
    return { siteName, currency, pricePerKwh };
  });
}

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
  const phaseConfig = deviceManager.getPhaseConfigByName(deviceId);
  const phases = {};

  if (!Number.isFinite(ts)) throw new Error('Invalid reading timestamp.');
  if (!Number.isFinite(powerFactor)) throw new Error('Invalid power factor.');

  for (const phase of ['l1', 'l2', 'l3']) {
    const enabled = phaseConfig[phase]?.enabled !== false;
    if (!enabled) {
      phases[phase] = { enabled: false };
      continue;
    }

    const voltage = Number(body[phase]?.voltage ?? body[`${phase}_voltage`]);
    const current = Number(body[phase]?.current ?? body[`${phase}_current`]);
    if (!Number.isFinite(voltage)) throw new Error(`Invalid or missing numeric field: ${phase}Voltage`);
    if (!Number.isFinite(current)) throw new Error(`Invalid or missing numeric field: ${phase}Current`);
    phases[phase] = {
      enabled: true,
      voltage,
      current,
      powerKw: (voltage * current * powerFactor) / 1000
    };
  }

  const totalPowerKw = Object.values(phases)
    .filter((phase) => phase.enabled)
    .reduce((sum, phase) => sum + phase.powerKw, 0);

  return {
    deviceId,
    ts,
    neutralPresent: neutralPresent ? 1 : 0,
    frequencyHz,
    powerFactor,
    totalPowerKw,
    phases,
    activePhaseCount: Object.values(phases).filter((phase) => phase.enabled).length
  };
}

function insertReading(r) {
  return enqueueDbWrite(async () => {
    let transactionStarted = false;

    try {
      await runDb('BEGIN IMMEDIATE TRANSACTION');
      transactionStarted = true;

      const snapshotResult = await runDb(`INSERT INTO meter_snapshots (
        device_id, ts, neutral_present, frequency_hz, power_factor, total_power_kw
      ) VALUES (?, ?, ?, ?, ?, ?)`, [
        r.deviceId, r.ts, r.neutralPresent, r.frequencyHz, r.powerFactor, r.totalPowerKw
      ]);

      for (const [phase, value] of Object.entries(r.phases)) {
        if (!value.enabled) continue;
        await runDb(`INSERT INTO phase_readings
                     (device_id, ts, phase, voltage, current, power_kw)
                     VALUES (?, ?, ?, ?, ?, ?)`, [
          r.deviceId, r.ts, phase, value.voltage, value.current, value.powerKw
        ]);
      }

      await runDb('COMMIT');
      transactionStarted = false;

      return {
        id: snapshotResult.lastID,
        deviceId: r.deviceId,
        ts: r.ts,
        neutralPresent: Boolean(r.neutralPresent),
        frequencyHz: r.frequencyHz,
        powerFactor: r.powerFactor,
        totalPowerKw: r.totalPowerKw,
        ...Object.fromEntries(['l1', 'l2', 'l3'].map((phase) => {
          const value = r.phases[phase];
          return [`${phase}Voltage`, value.enabled ? value.voltage : null];
        })),
        ...Object.fromEntries(['l1', 'l2', 'l3'].map((phase) => {
          const value = r.phases[phase];
          return [`${phase}Current`, value.enabled ? value.current : null];
        })),
        ...Object.fromEntries(['l1', 'l2', 'l3'].map((phase) => {
          const value = r.phases[phase];
          return [`${phase}PowerKw`, value.enabled ? value.powerKw : null];
        }))
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          await runDb('ROLLBACK');
        } catch (rollbackError) {
          app.log.error({ err: rollbackError }, 'Failed to roll back SQLite transaction');
        }
      }
      throw error;
    }
  });
}

function latestReading(deviceId = 'uwc-meter-001') {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM meter_snapshots
            WHERE device_id = ? ORDER BY ts DESC LIMIT 1`, [deviceId], (err, snapshot) => {
      if (err) return reject(err);
      if (!snapshot) return resolve(null);
      db.all(`SELECT phase, voltage, current, power_kw
              FROM phase_readings WHERE device_id = ? AND ts = ?`, [deviceId, snapshot.ts], (phaseErr, rows) => {
        if (phaseErr) return reject(phaseErr);
        const values = Object.fromEntries(rows.map((row) => [row.phase, row]));
        resolve({ snapshot, values });
      });
    });
  });
}

function history(deviceId, hours = 24) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 24 * 365);
  const since = Date.now() - safeHours * 60 * 60 * 1000;
  return new Promise((resolve, reject) => {
    db.all(`SELECT ts, phase, power_kw FROM phase_readings
            WHERE device_id = ? AND ts >= ? ORDER BY ts ASC`, [deviceId, since], (err, phaseRows) => {
      if (err) return reject(err);
      db.all(`SELECT phase, enabled, ts FROM phase_config_events
              WHERE device_id = ? AND ts >= ? ORDER BY ts ASC`, [deviceId, since], (eventErr, events) => {
        if (eventErr) return reject(eventErr);
        const byTimestamp = new Map();
        for (const row of phaseRows) {
          if (!byTimestamp.has(row.ts)) byTimestamp.set(row.ts, { ts: row.ts, l1_power_kw: null, l2_power_kw: null, l3_power_kw: null });
          byTimestamp.get(row.ts)[`${row.phase}_power_kw`] = row.power_kw;
        }
        resolve({ rows: [...byTimestamp.values()], events: events.map((event) => ({
          phase: event.phase,
          enabled: Boolean(event.enabled),
          ts: event.ts
        })) });
      });
    });
  });
}

function totalPowerHistory(hours = 24) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 24 * 365);
  const since = Date.now() - safeHours * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    db.all(`WITH latest_samples AS (
              SELECT CAST(ts / 1000 AS INTEGER) AS time_bucket, device_id, MAX(ts) AS latest_ts
              FROM meter_snapshots WHERE ts >= ? GROUP BY time_bucket, device_id
            )
            SELECT samples.time_bucket * 1000 AS ts,
                   SUM(snapshots.total_power_kw) AS total_power_kw
            FROM latest_samples AS samples
            JOIN meter_snapshots AS snapshots
              ON snapshots.device_id = samples.device_id AND snapshots.ts = samples.latest_ts
            GROUP BY samples.time_bucket ORDER BY samples.time_bucket ASC`, [since], (err, rows) => {
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

  return Promise.all(periods.map((period) => new Promise((resolve, reject) => {
    const since = Date.now() - period.hours * 60 * 60 * 1000;
    db.all(`SELECT ts, phase, power_kw FROM phase_readings
            WHERE device_id = ? AND ts >= ? ORDER BY phase, ts ASC`, [deviceId, since], (err, rows) => {
      if (err) return reject(err);
      const grouped = { l1: [], l2: [], l3: [] };
      rows.forEach((row) => grouped[row.phase].push(row));
      const l1Kwh = integratePhaseKwh(grouped.l1);
      const l2Kwh = integratePhaseKwh(grouped.l2);
      const l3Kwh = integratePhaseKwh(grouped.l3);
      resolve({ period, l1Kwh, l2Kwh, l3Kwh, totalKwh: l1Kwh + l2Kwh + l3Kwh });
    });
  })));
}

function integratePhaseKwh(rows) {
  if (!rows || rows.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1];
    const current = rows[i];
    const elapsedHours = Math.max(0, (current.ts - previous.ts) / 3600000);
    // Do not bridge a disabled interval or an unexpectedly long collection gap.
    if (elapsedHours > 0.25) continue;
    total += ((previous.power_kw + current.power_kw) / 2) * elapsedHours;
  }
  return total;
}

function rowToApi(result, deviceId) {
  if (!result) return null;
  const phaseConfig = deviceManager.getPhaseConfigByName(deviceId);
  const { snapshot, values } = result;
  const api = {
    id: snapshot.id,
    deviceId: snapshot.device_id,
    ts: snapshot.ts,
    neutralPresent: Boolean(snapshot.neutral_present),
    frequencyHz: snapshot.frequency_hz,
    powerFactor: snapshot.power_factor,
    totalPowerKw: snapshot.total_power_kw,
    phaseConfig
  };
  for (const phase of ['l1', 'l2', 'l3']) {
    const row = values[phase];
    api[phase] = row ? { voltage: row.voltage, current: row.current, powerKw: row.power_kw } : null;
  }
  return api;
}

function recordPhaseEvents(deviceId, previousConfig, nextConfig) {
  const now = Date.now();
  const changes = ['l1', 'l2', 'l3'].filter((phase) => previousConfig[phase].enabled !== nextConfig[phase].enabled);
  if (changes.length === 0) return Promise.resolve();

  return enqueueDbWrite(async () => {
    for (const phase of changes) {
      await runDb(`INSERT INTO phase_config_events (device_id, phase, enabled, ts)
                   VALUES (?, ?, ?, ?)`, [
        deviceId, phase, nextConfig[phase].enabled ? 1 : 0, now
      ]);
    }
  });
}

function getDevicesApi() {
  return deviceManager.getDevices().map((device) => {
    const activePhases = ['l1', 'l2', 'l3'].filter((phase) => device.phaseConfig?.[phase]?.enabled !== false);
    const voltages = activePhases.map((phase) => Number(device.data?.voltage?.[phase])).filter(Number.isFinite);
    const currents = activePhases.map((phase) => Number(device.data?.current?.[phase])).filter(Number.isFinite);
    const powerFactor = Number(device.data?.powerFactor ?? 1);
    const averageVoltage = voltages.length ? voltages.reduce((sum, value) => sum + value, 0) / voltages.length : null;
    const totalCurrent = currents.length ? currents.reduce((sum, value) => sum + value, 0) : null;
    const totalPower = averageVoltage !== null && totalCurrent !== null
      ? averageVoltage * totalCurrent * powerFactor / 1000
      : null;

    return {
      id: device.id,
      name: device.name,
      enabled: device.enabled,
      provider: device.provider,
      type: device.type,
      connection: device.connection,
      ipAddress: device.ipAddress,
      pollInterval: device.pollInterval,
      status: device.status,
      statusMessage: device.statusMessage,
      lastAttempt: device.lastAttempt,
      lastSuccess: device.lastSuccess,
      averageVoltage: averageVoltage === null ? null : Number(averageVoltage.toFixed(1)),
      totalCurrent: totalCurrent === null ? null : Number(totalCurrent.toFixed(1)),
      totalPower: totalPower === null ? null : Number(totalPower.toFixed(2)),
      frequency: device.data?.frequency ?? null,
      lastUpdate: device.data?.timestamp ?? null,
      phaseConfig: device.phaseConfig
    };
  });
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
    if (reading.activePhaseCount === 0) return { ok: true, skipped: true, reason: 'All phase lines are disabled' };
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

app.get('/api/providers', async () => deviceManager.getProviders());

app.get('/api/settings', async () => getSettings());

app.put('/api/settings', async (request, reply) => {
  try {
    return await updateSettings(request.body || {});
  } catch (err) {
    reply.code(400).send({ error: err.message });
  }
});

app.post('/api/devices', async (request, reply) => {
  try {
    const device = deviceManager.addDevice(request.body || {});
    reply.code(201);
    return {
      id: device.id,
      name: device.name,
      enabled: device.enabled,
      provider: device.provider,
      type: device.type,
      connection: device.connection,
      ipAddress: device.ipAddress,
      pollInterval: device.pollInterval,
      status: device.status,
      statusMessage: device.statusMessage
    };
  } catch (err) {
    reply.code(400).send({ error: err.message });
  }
});

app.put('/api/devices/:id/phases', async (request, reply) => {
  try {
    const current = deviceManager.getDevice(request.params.id);
    if (!current) return reply.code(404).send({ error: 'Device not found.' });
    const nextConfig = deviceManager.validatePhaseConfig(request.body || {});
    await recordPhaseEvents(current.name, current.phaseConfig, nextConfig);
    const updated = deviceManager.updatePhaseConfig(request.params.id, nextConfig);
    broadcast({ type: 'phase-config', data: { deviceId: updated.name, phaseConfig: updated.phaseConfig } });
    return { deviceId: updated.name, phaseConfig: updated.phaseConfig };
  } catch (err) {
    reply.code(400).send({ error: err.message });
  }
});

app.put('/api/devices/:id', async (request, reply) => {
  try {
    return await deviceManager.updateDevice(request.params.id, request.body || {});
  } catch (err) {
    const status = err.message === 'Device not found.' ? 404 : 400;
    reply.code(status).send({ error: err.message });
  }
});

app.delete('/api/devices/:id', async (request, reply) => {
  try {
    const device = await deviceManager.removeDevice(request.params.id);
    return { ok: true, device };
  } catch (err) {
    const status = err.message === 'Device not found.' ? 404 : 400;
    reply.code(status).send({ error: err.message });
  }
});
app.get('/api/latest', async (request) => {
  const deviceId = request.query.deviceId || 'uwc-meter-001';
  return rowToApi(await latestReading(deviceId), deviceId);
});
app.get('/api/history', async (request) => history(request.query.deviceId || 'uwc-meter-001', Number(request.query.hours || 24)));
app.get('/api/history/total-power', async (request) => totalPowerHistory(Number(request.query.hours || 24)));
app.get('/api/summary', async (request) => energySummary(request.query.deviceId || 'uwc-meter-001'));
app.get('/api/health', async () => ({ ok: true, service: 'UWC Energy Monitor', requestId: crypto.randomUUID() }));

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
  ws.send(JSON.stringify({ type: 'hello', data: { service: 'UWC Energy Monitor', ts: Date.now() } }));
});

if (ENABLE_SIMULATOR) {

    app.log.info("Starting multi-device simulator...");

    setInterval(async () => {

        const devices = deviceManager.getDevices();

        for (const device of devices) {

            if (!device.enabled || !device.data) continue;
            if (Object.values(device.phaseConfig || {}).every((phase) => phase.enabled === false)) continue;

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
