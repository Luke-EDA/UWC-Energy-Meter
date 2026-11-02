'use strict';
const net = require('net');
const { latest } = require('./energyguardProvider');
const PHASES = ['l1', 'l2', 'l3'];
const number = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
async function getJson(host, port, endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`http://${host}:${port}${endpoint}`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function read(device) {
  const id = String(device.providerOptions?.energyguardDeviceId || '').toUpperCase();
  const udp = latest(id);
  // Only accept a discovered IP associated with this meter identity. Do not fetch arbitrary URLs.
  const host = udp?.senderIp || device.connection?.host;
  const port = Number(device.providerOptions?.energyguardPort || 80);
  if (net.isIP(host) !== 4 || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('EnergyGuard needs a discovered IPv4 address and valid HTTP port');
  }
  const [measurement, instantaneous, energy] = await Promise.all([
    getJson(host, port, '/api/v1/measurements'),
    getJson(host, port, '/api/v1/instantaneous'),
    getJson(host, port, '/api/v1/energy')
  ]);
  if (measurement.schema !== 'energyguard.measurement.v1' ||
      String(measurement.device_id || '').toUpperCase() !== id ||
      instantaneous.schema !== 'energyguard.instantaneous.stage_c3.v1' ||
      energy.schema !== 'energyguard.energy.stage_c4a.v1') throw new Error('Unexpected EnergyGuard API schema or device identity');
  const voltage = {}, current = {}, powerKw = {}, phaseDetails = {};
  for (const phase of PHASES) {
    const inst = instantaneous.phases?.[phase] || {};
    const phaseEnabled = device.phaseConfig?.[phase]?.enabled !== false;
    const v = phaseEnabled && inst.voltage_signal_valid === true ? number(measurement.voltage_v?.[phase]) : null;
    // Policy for dashboard display/history only: online enabled phases with
    // valid voltage and a below-threshold signal are recorded as provisional zero.
    // Missing voltage, disabled phases and communications failures never become zero.
    const zeroSubstituted = phaseEnabled && v !== null &&
      inst.current_measurement_state === 'below_threshold_or_absent';
    const a = !phaseEnabled ? null : inst.current_signal_valid === true
      ? number(inst.current_a) : zeroSubstituted ? 0 : null;
    const w = !phaseEnabled ? null : inst.voltage_signal_valid === true && inst.current_signal_valid === true
      ? number(inst.active_power_w) : zeroSubstituted ? 0 : null;
    voltage[phase] = v;
    current[phase] = a;
    powerKw[phase] = w === null ? null : w / 1000;
    phaseDetails[phase] = { voltage: v, current: a, powerKw: powerKw[phase],
      reactiveVar: number(inst.reactive_power_var), apparentVa: number(inst.apparent_power_va),
      activePowerW: w, phaseAngleDeg: number(inst.angle_vi_deg),
      powerFactor: number(inst.power_factor), frequencyHz: number(inst.frequency_hz),
      energy: energy.phases?.[phase] || null,
      currentMeasurementState: inst.current_measurement_state || null,
      zeroSubstituted };
  }
  const enabled = PHASES.filter(p => device.phaseConfig?.[p]?.enabled !== false);
  const valid = enabled.filter(p => powerKw[p] !== null);
  const sum = (values) => values.reduce((a,b)=>a+b,0);
  const frequency = valid.map(p => phaseDetails[p].frequencyHz).find(v => v !== null) ?? null;
  const pf = valid.map(p => phaseDetails[p].powerFactor).find(v => v !== null) ?? null;
  return { voltage, current, powerKw, phases: phaseDetails,
    averageVoltage: enabled.map(p=>voltage[p]).filter(v=>v!==null).length ? sum(enabled.map(p=>voltage[p]).filter(v=>v!==null))/enabled.map(p=>voltage[p]).filter(v=>v!==null).length : null,
    totalCurrent: valid.length ? sum(valid.map(p=>current[p])) : null,
    totalPower: valid.length ? sum(valid.map(p=>powerKw[p])) : null,
    frequencyHz: frequency, powerFactor: pf,
    energyWh: valid.length ? sum(valid.map(p=>number(energy.phases?.[p]?.import_wh) || 0)) : null,
    calibrated: false, measurementValid: valid.length > 0, source: 'energyguard-http',
    timestamp: new Date().toISOString(), sequence: measurement.sequence, meterId: id,
    host, port, energyPersistenceOk: energy.persistence_ok === true };
}
module.exports = { read };
