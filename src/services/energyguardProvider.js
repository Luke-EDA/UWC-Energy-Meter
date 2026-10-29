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
    return require('./energyguardHttp').read(this.deviceConfig);
  }
}
module.exports = { EnergyGuardProvider, accept, latest };
