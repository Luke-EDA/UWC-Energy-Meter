'use strict';

/**
 * Common interface for all device data providers.
 *
 * Providers translate a device-specific communications method into the
 * application's standard measurement shape. The dashboard, history database,
 * and API should never need to know which protocol produced a reading.
 */
class BaseProvider {
  constructor(deviceConfig) {
    this.deviceConfig = deviceConfig;
  }

  async start() {}

  async stop() {}

  async read() {
    throw new Error('Provider read() has not been implemented.');
  }
}

module.exports = BaseProvider;
