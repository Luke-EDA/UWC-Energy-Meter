'use strict';

const fs = require('fs');
const path = require('path');
const { createProvider, isSupported, listProviders } = require('./providerFactory');

const CONFIG_FILE = path.join(__dirname, '../config/devices.json');
const SCHEDULER_INTERVAL_MS = 100;
const PHASE_KEYS = ['l1', 'l2', 'l3'];

class DeviceManager {
  constructor() {
    this.devices = [];
    this.loadDevices();
    this.updateTimer = setInterval(() => this.pollDueDevices(), SCHEDULER_INTERVAL_MS);
  }

  readConfig() {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(raw);
    if (!Array.isArray(config)) throw new Error('Device configuration must be an array.');
    return config;
  }

  loadDevices() {
    this.devices = this.readConfig().map((device) => this.createRuntimeDevice(device));
  }

  normaliseStoredDevice(device) {
    let provider = String(device.provider || device.type || 'dummy').toLowerCase();
    if (provider === 'network' && device.providerOptions?.energyguardDeviceId) provider = 'energyguard';
    const connection = device.connection && typeof device.connection === 'object'
      ? { ...device.connection }
      : { host: device.ipAddress || '' };

    // Preserve legacy values inside providerOptions for backward compatibility,
    // without making them part of the protocol-agnostic core configuration.
    const providerOptions = device.providerOptions && typeof device.providerOptions === 'object'
      ? { ...device.providerOptions }
      : {
          ...(device.port ? { legacyPort: Number(device.port) } : {}),
          ...(device.slaveId ? { legacySlaveId: Number(device.slaveId) } : {})
        };

    const storedPhaseConfig = device.phaseConfig && typeof device.phaseConfig === 'object'
      ? device.phaseConfig
      : {};
    const phaseConfig = Object.fromEntries(PHASE_KEYS.map((phase) => {
      const stored = storedPhaseConfig[phase] && typeof storedPhaseConfig[phase] === 'object'
        ? storedPhaseConfig[phase]
        : {};
      return [phase, {
        enabled: stored.enabled !== false,
        label: String(stored.label || '').trim().slice(0, 50)
      }];
    }));

    return {
      id: Number(device.id),
      name: String(device.name),
      provider,
      enabled: device.enabled !== false,
      pollInterval: Number(device.pollInterval || 1000),
      connection,
      providerOptions,
      phaseConfig
    };
  }

  createRuntimeDevice(device) {
    const config = this.normaliseStoredDevice(device);
    const providerInstance = createProvider(config);
    return {
      ...config,
      providerInstance,
      latestData: null,
      status: config.enabled ? 'initialising' : 'disabled',
      statusMessage: config.enabled ? 'Waiting for first reading' : 'Device is disabled',
      lastAttempt: null,
      lastSuccess: null,
      nextPollAt: 0,
      polling: false
    };
  }

  async pollDueDevices() {
    const now = Date.now();
    for (const device of this.devices) {
      if (!device.enabled || device.polling || now < device.nextPollAt) continue;
      device.nextPollAt = now + device.pollInterval;
      this.pollDevice(device).catch(() => {});
    }
  }

  async pollDevice(device) {
    device.polling = true;
    device.lastAttempt = new Date().toISOString();
    try {
      const data = await device.providerInstance.read();
      if (!data || typeof data !== 'object') throw new Error('Provider returned no measurement data.');
      device.latestData = data;
      device.lastSuccess = data.timestamp || new Date().toISOString();
      device.status = 'online';
      device.statusMessage = data.source === 'energyguard-udp'
        ? (data.calibrated ? 'Receiving live UDP measurements' : 'Live UDP measurements (uncalibrated)')
        : 'Receiving data';
    } catch (error) {
      if (error.code === 'METER_INVALID') {
        device.status = 'invalid';
      } else if (error.code === 'ADAPTER_NOT_CONFIGURED') {
        device.status = 'adapter_not_configured';
      } else {
        device.status = device.lastSuccess ? 'offline' : 'error';
      }
      device.statusMessage = error.message;
    } finally {
      device.polling = false;
    }
  }

  saveDevices() {
    const serialisable = this.devices.map((device) => ({
      id: device.id,
      name: device.name,
      provider: device.provider,
      enabled: device.enabled,
      pollInterval: device.pollInterval,
      connection: device.connection,
      providerOptions: device.providerOptions,
      phaseConfig: device.phaseConfig
    }));

    const temporaryFile = `${CONFIG_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, `${JSON.stringify(serialisable, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryFile, CONFIG_FILE);
  }

  refreshDiscoveredAddress(id, host, port) {
    const device = this.findRuntimeDevice(id);
    if (!device || !device.providerOptions?.energyguardDeviceId) return;
    device.connection.host = host;
    device.providerOptions.energyguardPort = port;
    this.saveDevices();
  }

  getProviders() {
    return listProviders();
  }

  getDevices() {
    return this.devices.map((device) => this.toPublicDevice(device));
  }

  getDevice(id) {
    const device = this.findRuntimeDevice(id);
    return device ? this.toPublicDevice(device) : null;
  }

  findRuntimeDevice(id) {
    return this.devices.find((candidate) => candidate.id === Number(id));
  }

  addDevice(input) {
    const device = this.validateDevice(input);
    const nextId = this.devices.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
    const runtimeDevice = this.createRuntimeDevice({ ...device, id: nextId });
    this.devices.push(runtimeDevice);
    this.saveDevices();
    return this.toPublicDevice(runtimeDevice);
  }

  async updateDevice(id, input) {
    const existing = this.findRuntimeDevice(id);
    if (!existing) throw new Error('Device not found.');

    const updated = this.validateDevice(input, existing.id);
    const recreateProvider = existing.name !== updated.name || existing.provider !== updated.provider;

    if (recreateProvider) await existing.providerInstance.stop();

    existing.name = updated.name;
    existing.provider = updated.provider;
    existing.connection = updated.connection;
    existing.providerOptions = updated.providerOptions;
    existing.pollInterval = updated.pollInterval;
    existing.enabled = updated.enabled;
    existing.phaseConfig = updated.phaseConfig;

    if (recreateProvider) existing.providerInstance = createProvider(existing);
    existing.latestData = existing.enabled && !recreateProvider ? existing.latestData : null;
    existing.status = existing.enabled ? 'initialising' : 'disabled';
    existing.statusMessage = existing.enabled ? 'Waiting for next reading' : 'Device is disabled';
    existing.nextPollAt = 0;
    existing.lastAttempt = null;
    if (!existing.enabled) existing.lastSuccess = null;

    this.saveDevices();
    return this.toPublicDevice(existing);
  }

  async removeDevice(id) {
    const index = this.devices.findIndex((candidate) => candidate.id === Number(id));
    if (index === -1) throw new Error('Device not found.');

    const [removed] = this.devices.splice(index, 1);
    await removed.providerInstance.stop();
    this.saveDevices();
    return this.toPublicDevice(removed);
  }

  validateDevice(input = {}, excludedId = null) {
    const name = String(input.name || '').trim();
    const provider = String(input.provider || input.type || 'dummy').trim().toLowerCase();
    const host = String(input.connection?.host ?? input.host ?? input.ipAddress ?? '').trim();
    const pollInterval = Number(input.pollInterval ?? 1000);
    const enabled = input.enabled !== false;
    const providerOptions = input.providerOptions && typeof input.providerOptions === 'object'
      ? { ...input.providerOptions }
      : {};
    if (providerOptions.energyguardDeviceId !== undefined) {
      const identity = String(providerOptions.energyguardDeviceId).toUpperCase();
      if (!/^[0-9A-F]{12}$/.test(identity)) throw new Error('Invalid EnergyGuard device ID.');
      if (this.devices.some(device => device.id !== excludedId &&
          String(device.providerOptions?.energyguardDeviceId || '').toUpperCase() === identity)) {
        throw new Error('This EnergyGuard meter is already registered.');
      }
      providerOptions.energyguardDeviceId = identity;
    }
    const existingPhaseConfig = excludedId === null
      ? {}
      : (this.findRuntimeDevice(excludedId)?.phaseConfig || {});
    const suppliedPhaseConfig = input.phaseConfig && typeof input.phaseConfig === 'object'
      ? input.phaseConfig
      : existingPhaseConfig;
    const phaseConfig = this.validatePhaseConfig(suppliedPhaseConfig);

    if (name.length < 2 || name.length > 80) {
      throw new Error('Device name must be between 2 and 80 characters.');
    }
    if (this.devices.some((device) => device.id !== excludedId && device.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('A device with this name already exists.');
    }
    if (!isSupported(provider)) {
      throw new Error('Select a supported data provider.');
    }
    if (host.length > 255) {
      throw new Error('Network host must be 255 characters or fewer.');
    }
    if (!Number.isInteger(pollInterval) || pollInterval < 250 || pollInterval > 60000) {
      throw new Error('Update interval must be between 250 and 60000 ms.');
    }

    return {
      name,
      provider,
      enabled,
      pollInterval,
      connection: { host },
      providerOptions,
      phaseConfig
    };
  }

  validatePhaseConfig(input = {}) {
    return Object.fromEntries(PHASE_KEYS.map((phase) => {
      const value = input[phase] && typeof input[phase] === 'object' ? input[phase] : {};
      const label = String(value.label || '').trim();
      if (label.length > 50) throw new Error(`${phase.toUpperCase()} label must be 50 characters or fewer.`);
      return [phase, { enabled: value.enabled !== false, label }];
    }));
  }

  updatePhaseConfig(id, input = {}) {
    const existing = this.findRuntimeDevice(id);
    if (!existing) throw new Error('Device not found.');
    existing.phaseConfig = this.validatePhaseConfig(input);
    this.saveDevices();
    return this.toPublicDevice(existing);
  }

  findRuntimeDeviceByName(name) {
    const target = String(name || '').toLowerCase();
    return this.devices.find((device) => device.name.toLowerCase() === target);
  }

  getPhaseConfigByName(name) {
    return this.findRuntimeDeviceByName(name)?.phaseConfig || this.validatePhaseConfig({});
  }

  toPublicDevice(device) {
    return {
      id: device.id,
      name: device.name,
      enabled: device.enabled,
      provider: device.provider,
      type: device.provider, // Compatibility alias for the v1.4.x browser code.
      pollInterval: device.pollInterval,
      connection: { ...device.connection },
      ipAddress: device.connection?.host || '', // Compatibility alias.
      providerOptions: { ...device.providerOptions },
      phaseConfig: JSON.parse(JSON.stringify(device.phaseConfig)),
      status: device.enabled ? device.status : 'disabled',
      statusMessage: device.enabled ? device.statusMessage : 'Device is disabled',
      lastAttempt: device.lastAttempt,
      lastSuccess: device.lastSuccess,
      data: device.latestData
    };
  }
}

module.exports = new DeviceManager();
