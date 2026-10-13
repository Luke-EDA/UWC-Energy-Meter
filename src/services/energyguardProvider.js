'use strict';
const BaseProvider = require('./baseProvider');
const TTL_MS = Number(process.env.ENERGYGUARD_MEASUREMENT_TIMEOUT_MS || 15000);
const readings = new Map();
function validNumber(n) { return typeof n === 'number' && Number.isFinite(n) && n >= 0; }
function accept(message, senderIp) {
  if (!message || message.schema !== 'energyguard.measurement.v1' ||
      !/^[0-9a-fA-F]{12}$/.test(message.device_id || '') ||
      !message.voltage_v || !message.current_a) return false;
  const id = message.device_id.toUpperCase();
  const voltage = {}, current = {};
  for (const phase of ['l1','l2','l3']) {
    if (!validNumber(message.voltage_v[phase]) || !validNumber(message.current_a[phase])) return false;
    voltage[phase] = message.voltage_v[phase];
    current[phase] = message.current_a[phase];
  }
  const receivedAt = Date.now();
  readings.set(id, { id, senderIp, receivedAt, sequence: message.sequence,
    valid: message.valid === true, calibrated: message.calibrated === true,
    voltage, current });
  return true;
}
function latest(id) {
  const value = readings.get(String(id || '').toUpperCase());
  return value && Date.now() - value.receivedAt <= TTL_MS ? value : null;
}
class EnergyGuardProvider extends BaseProvider {
  async read() {
    const sample = latest(this.deviceConfig.providerOptions?.energyguardDeviceId);
    if (!sample) { const err = new Error('No recent EnergyGuard broadcast received'); err.code = 'METER_OFFLINE'; throw err; }
    if (!sample.valid) { const err = new Error('Meter reports invalid measurements'); err.code = 'METER_INVALID'; throw err; }
    const calibrated = sample.calibrated;
    const avg = Object.values(sample.voltage).reduce((a,b)=>a+b,0)/3;
    const amps = Object.values(sample.current).reduce((a,b)=>a+b,0);
    return { voltage: { ...sample.voltage }, current: { ...sample.current },
      averageVoltage: avg, totalCurrent: amps,
      totalPower: ['l1','l2','l3'].reduce((s,p)=>s+sample.voltage[p]*sample.current[p],0)/1000,
      calibrated,
      measurementValid: true, source: 'energyguard-udp', sequence: sample.sequence,
      timestamp: new Date(sample.receivedAt).toISOString() };
  }
}
module.exports = { EnergyGuardProvider, accept, latest };
