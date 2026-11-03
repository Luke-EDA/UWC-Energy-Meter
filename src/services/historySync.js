'use strict';
const net = require('net');
const PHASES = ['l1','l2','l3'];
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
async function fetchPage(host, port, sinceSeq, limit = 20) {
  if (net.isIP(host) !== 4 || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid EnergyGuard history host/port');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`http://${host}:${port}/api/v1/history?since_seq=${sinceSeq}&limit=${limit}`,
      { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`History HTTP ${response.status}`);
    const data = await response.json();
    if (data.schema !== 'energyguard.history.c4d.v1' || !Array.isArray(data.records) ||
        !Number.isSafeInteger(data.boot_id) || !Number.isSafeInteger(data.latest_seq) ||
        !Number.isSafeInteger(data.oldest_seq) || !Number.isSafeInteger(data.next_since_seq) ||
        typeof data.has_more !== 'boolean' || typeof data.cursor_overrun !== 'boolean' ||
        data.records.length > limit || data.records.length > 100)
      throw new Error('Invalid C4D history response');
    return data;
  } finally { clearTimeout(timer); }
}
function normalize(record, device) {
  if (!Number.isSafeInteger(record.seq) || record.seq < 1 ||
      !Number.isSafeInteger(record.uptime_ms) || record.uptime_ms < 0)
    throw new Error('Invalid history sequence or uptime');
  const phases = {};
  for (const phase of PHASES) {
    const raw = record.phases?.[phase] || {};
    const enabled = device.phaseConfig?.[phase]?.enabled !== false;
    const available = enabled && raw.voltage_signal_valid === true;
    const measured = raw.current_signal_valid === true;
    const substituted = raw.current_measurement_state === 'below_threshold_or_absent';
    const current = available ? (measured ? finite(raw.current_a) : substituted ? 0 : null) : null;
    const watts = available ? (measured ? finite(raw.active_power_w) : substituted ? 0 : null) : null;
    phases[phase] = { available: current !== null && watts !== null, current,
      powerKw: watts === null ? null : watts / 1000,
      quality: measured ? 'measured' : substituted ? 'substituted_zero' : 'unavailable' };
  }
  return { seq: record.seq, uptimeMs: record.uptime_ms, phases };
}
module.exports = { fetchPage, normalize };
