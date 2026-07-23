'use strict';

const fs = require('fs');
const path = require('path');
const DummyProvider = require('./dummyProvider');

const CONFIG_FILE = path.join(__dirname, '../config/devices.json');

class DeviceManager {
  constructor() {
    this.devices = [];
    this.loadDevices();

    this.updateTimer = setInterval(() => {
      this.devices.forEach((device) => {
        if (device.enabled) device.latestData = device.provider.update();
      });
    }, 1000);
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

  createRuntimeDevice(device) {
    const provider = new DummyProvider(device.name);
    return {
      id: Number(device.id),
      name: String(device.name),
      type: device.type || 'dummy',
      ipAddress: device.ipAddress || '',
      port: Number(device.port || 502),
      slaveId: Number(device.slaveId || 1),
      pollInterval: Number(device.pollInterval || 1000),
      enabled: device.enabled !== false,
      provider,
      latestData: device.enabled === false ? null : provider.update()
    };
  }

  saveDevices() {
    const serialisable = this.devices.map((device) => ({
      id: device.id,
      name: device.name,
      type: device.type,
      ipAddress: device.ipAddress,
      port: device.port,
      slaveId: device.slaveId,
      pollInterval: device.pollInterval,
      enabled: device.enabled
    }));

    const temporaryFile = `${CONFIG_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, `${JSON.stringify(serialisable, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryFile, CONFIG_FILE);
  }

  getDevices() {
    return this.devices.map((device) => this.toPublicDevice(device));
  }

  getDevice(id) {
    const device = this.devices.find((candidate) => candidate.id === Number(id));
    return device ? this.toPublicDevice(device) : null;
  }

  addDevice(input) {
    const device = this.validateNewDevice(input);
    const nextId = this.devices.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
    const runtimeDevice = this.createRuntimeDevice({ ...device, id: nextId });
    this.devices.push(runtimeDevice);
    this.saveDevices();
    return this.toPublicDevice(runtimeDevice);
  }

  validateNewDevice(input = {}) {
    const name = String(input.name || '').trim();
    const type = String(input.type || 'dummy').trim().toLowerCase();
    const ipAddress = String(input.ipAddress || '').trim();
    const port = Number(input.port ?? 502);
    const slaveId = Number(input.slaveId ?? 1);
    const pollInterval = Number(input.pollInterval ?? 1000);
    const enabled = input.enabled !== false;

    if (name.length < 2 || name.length > 80) {
      throw new Error('Device name must be between 2 and 80 characters.');
    }
    if (this.devices.some((device) => device.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('A device with this name already exists.');
    }
    if (type !== 'dummy') {
      throw new Error('Only the Dummy Simulator device type is available in version 1.4.0.');
    }
    if (ipAddress && !/^([a-z0-9-]+\.)*[a-z0-9-]+$/i.test(ipAddress) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress)) {
      throw new Error('Enter a valid IP address or host name.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('TCP port must be a whole number from 1 to 65535.');
    }
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) {
      throw new Error('Modbus slave ID must be a whole number from 1 to 247.');
    }
    if (!Number.isInteger(pollInterval) || pollInterval < 250 || pollInterval > 60000) {
      throw new Error('Poll interval must be between 250 and 60000 ms.');
    }

    return { name, type, ipAddress, port, slaveId, pollInterval, enabled };
  }

  toPublicDevice(device) {
    return {
      id: device.id,
      name: device.name,
      enabled: device.enabled,
      type: device.type,
      ipAddress: device.ipAddress,
      port: device.port,
      slaveId: device.slaveId,
      pollInterval: device.pollInterval,
      data: device.latestData
    };
  }
}

module.exports = new DeviceManager();
