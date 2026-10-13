'use strict';

const DummyProvider = require('./dummyProvider');
const { EnergyGuardProvider } = require('./energyguardProvider');
const UnconfiguredNetworkProvider = require('./unconfiguredNetworkProvider');

const PROVIDERS = Object.freeze({
  dummy: {
    label: 'Dummy Simulator',
    create: (deviceConfig) => new DummyProvider(deviceConfig)
  },
  energyguard: {
    label: 'EnergyGuard UDP Meter',
    create: config => new EnergyGuardProvider(config)
  },
  network: {
    label: 'Network Adapter (not configured)',
    create: (deviceConfig) => new UnconfiguredNetworkProvider(deviceConfig)
  }
});

function createProvider(deviceConfig) {
  const providerKey = String(deviceConfig.provider || deviceConfig.type || 'dummy').toLowerCase();
  const definition = PROVIDERS[providerKey];
  if (!definition) throw new Error(`Unknown provider: ${providerKey}`);
  return definition.create(deviceConfig);
}

function isSupported(providerKey) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, String(providerKey || '').toLowerCase());
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([key, definition]) => ({ key, label: definition.label }));
}

module.exports = { createProvider, isSupported, listProviders };
