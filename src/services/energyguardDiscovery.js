'use strict';

const dgram = require('dgram');
const net = require('net');
const deviceManager = require('./deviceManager');
const energyguard = require('./energyguardProvider');

const PORT = Number(process.env.ENERGYGUARD_DISCOVERY_PORT || 4210);
const TTL_MS = 30000;
const seen = new Map();
let socket;

function validId(value) { return typeof value === 'string' && /^[0-9a-fA-F]{12}$/.test(value); }
function registered(id) {
  return deviceManager.getDevices().some(device =>
    String(device.providerOptions?.energyguardDeviceId || '').toUpperCase() === id);
}
function available() {
  const now = Date.now();
  for (const [id, item] of seen) if (now - item.lastSeen > TTL_MS) seen.delete(id);
  return [...seen.values()].filter(item => !registered(item.deviceId))
    .map(({ deviceId, name, ip, port, lastSeen }) => ({ deviceId, name, ip, port, lastSeen }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function receive(buffer, remote) {
  if (buffer.length > 8192 || net.isIP(remote.address) !== 4) return;
  let message;
  try { message = JSON.parse(buffer.toString('utf8')); } catch { return; }
  if (!message || message.type !== 'energyguard.announce.v1' ||
      message.schema !== 'energyguard.measurement.v1' || !validId(message.device_id)) return;
  const deviceId = message.device_id.toUpperCase();
  energyguard.accept(message, remote.address);
  const name = typeof message.name === 'string' && message.name.trim().length <= 80 && message.name.trim().length >= 2
    ? message.name.trim() : `EnergyGuard-${deviceId.slice(-4)}`;
  const port = Number(message.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  seen.set(deviceId, { deviceId, name, ip: remote.address, port, lastSeen: Date.now() });
  // Refresh a registered meter's DHCP address without changing its identity/history.
  const existing = deviceManager.getDevices().find(device =>
    String(device.providerOptions?.energyguardDeviceId || '').toUpperCase() === deviceId);
  if (existing && (existing.connection.host !== remote.address || existing.providerOptions?.energyguardPort !== port)) {
    deviceManager.refreshDiscoveredAddress(existing.id, remote.address, port);
  }
}
function start(logger = console) {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid ENERGYGUARD_DISCOVERY_PORT.');
  socket = dgram.createSocket('udp4');
  socket.on('message', receive);
  socket.on('error', error => logger.error?.(`EnergyGuard discovery: ${error.message}`));
  socket.bind(PORT, '0.0.0.0', () => logger.info?.(`EnergyGuard discovery listening on UDP ${PORT}`));
}
function stop() { if (socket) { socket.close(); socket = null; } }
function get(id) { return available().find(item => item.deviceId === String(id).toUpperCase()); }
module.exports = { start, stop, available, get, receive };
