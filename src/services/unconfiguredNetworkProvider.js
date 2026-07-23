'use strict';

const BaseProvider = require('./baseProvider');

/**
 * Placeholder for a future local-network adapter.
 *
 * It deliberately makes no assumptions about HTTP, MQTT, Modbus, raw TCP,
 * WebSockets, or any other protocol. A real adapter can replace this class
 * once the device firmware and communications contract are known.
 */
class UnconfiguredNetworkProvider extends BaseProvider {
  async read() {
    const error = new Error('A network communication adapter has not been configured for this device.');
    error.code = 'ADAPTER_NOT_CONFIGURED';
    throw error;
  }
}

module.exports = UnconfiguredNetworkProvider;
