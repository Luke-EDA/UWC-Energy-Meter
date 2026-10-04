'use strict';
// Save each valid broadcast once. Displayed kW assumes PF=1 (apparent power).
const lastSaved = new Map();
function makeReading(device, sample) {
  if (!device.enabled || !sample || !sample.valid) return null;
  const identity = device.providerOptions?.energyguardDeviceId;
  if (!identity || identity.toUpperCase() !== sample.id) return null;
  const last = lastSaved.get(sample.id);
  if (last === sample.receivedAt) return null;
  return {
    deviceId: device.name, ts: sample.receivedAt,
    neutralPresent: true,
    ...Object.fromEntries(['l1','l2','l3'].map(p => [p, { voltage: sample.voltage[p], current: sample.current[p] }]))
  };
}
function markSaved(sample) { lastSaved.set(sample.id, sample.receivedAt); }
module.exports = { makeReading, markSaved };
