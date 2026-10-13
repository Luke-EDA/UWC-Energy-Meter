'use strict';

const BaseProvider = require('./baseProvider');

/**
 * Simulator provider used while physical UWC units are under development.
 * It implements the same interface that future Wi-Fi communication adapters
 * will use.
 */
class DummyProvider extends BaseProvider {
  constructor(deviceConfig) {
    super(deviceConfig);
    this.deviceName = deviceConfig.name;
    this.state = {
      voltage: {
        l1: this.random(229, 232),
        l2: this.random(229, 232),
        l3: this.random(229, 232)
      },
      current: {
        l1: this.random(5, 40),
        l2: this.random(5, 40),
        l3: this.random(5, 40)
      },
      energyToday: this.random(25, 120),
      totalEnergy: this.random(1000, 9000)
    };
  }

  random(min, max) {
    return Number((Math.random() * (max - min) + min).toFixed(2));
  }

  drift(value, min, max, amount) {
    const changed = value + (Math.random() - 0.5) * amount;
    return Number(Math.min(max, Math.max(min, changed)).toFixed(2));
  }

  async read() {
    this.state.voltage.l1 = this.drift(this.state.voltage.l1, 228, 234, 0.30);
    this.state.voltage.l2 = this.drift(this.state.voltage.l2, 228, 234, 0.30);
    this.state.voltage.l3 = this.drift(this.state.voltage.l3, 228, 234, 0.30);

    this.state.current.l1 = this.drift(this.state.current.l1, 0, 120, 2);
    this.state.current.l2 = this.drift(this.state.current.l2, 0, 120, 2);
    this.state.current.l3 = this.drift(this.state.current.l3, 0, 120, 2);


    const avgVoltage = (this.state.voltage.l1 + this.state.voltage.l2 + this.state.voltage.l3) / 3;
    const totalCurrent = this.state.current.l1 + this.state.current.l2 + this.state.current.l3;
    const totalPower = ['l1','l2','l3'].reduce((sum, p) => sum + this.state.voltage[p] * this.state.current[p], 0) / 1000;

    this.state.energyToday += totalPower / 3600;
    this.state.totalEnergy += totalPower / 3600;

    return {
      averageVoltage: Number(avgVoltage.toFixed(1)),
      totalCurrent: Number(totalCurrent.toFixed(1)),
      totalPower: Number(totalPower.toFixed(2)),
      energyToday: Number(this.state.energyToday.toFixed(2)),
      totalEnergy: Number(this.state.totalEnergy.toFixed(2)),
      voltage: { ...this.state.voltage },
      current: { ...this.state.current },
      neutralPresent: true,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = DummyProvider;
