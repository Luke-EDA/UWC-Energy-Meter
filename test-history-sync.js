'use strict';
const assert = require('node:assert/strict');
const { normalize } = require('./src/services/historySync');
const device = { phaseConfig: { l1: { enabled: true }, l2: { enabled: true }, l3: { enabled: false } } };
const record = { seq: 14, uptime_ms: 140159, phases: {
  l1: { voltage_signal_valid: true, current_signal_valid: false,
    current_measurement_state: 'below_threshold_or_absent', current_a: null, active_power_w: null },
  l2: { voltage_signal_valid: false, current_signal_valid: false,
    current_measurement_state: 'voltage_unavailable', current_a: null, active_power_w: null },
  l3: { voltage_signal_valid: true, current_signal_valid: true,
    current_measurement_state: 'measuring', current_a: 2, active_power_w: 450 }
}};
const result = normalize(record, device);
assert.equal(result.phases.l1.powerKw, 0);
assert.equal(result.phases.l1.quality, 'substituted_zero');
assert.equal(result.phases.l2.available, false);
assert.equal(result.phases.l3.available, false);
record.phases.l1 = { voltage_signal_valid: true, current_signal_valid: true,
  current_measurement_state: 'measuring', current_a: 1.64, active_power_w: 380 };
const measured = normalize(record, device);
assert.equal(measured.phases.l1.powerKw, 0.38);
assert.equal(measured.phases.l1.quality, 'measured');
console.log('C4D normalization tests passed');
