const fs = require("fs");
const path = require("path");

const DummyProvider = require("./dummyProvider");

class DeviceManager {

    constructor() {

        this.devices = [];

        this.loadDevices();

        // Update every device once per second
        setInterval(() => {

            this.devices.forEach(device => {

                device.latestData = device.provider.update();

            });

        }, 1000);

    }

    loadDevices() {

        const filename = path.join(
            __dirname,
            "../config/devices.json"
        );

        const config = JSON.parse(
            fs.readFileSync(filename)
        );

        this.devices = config.map(device => {

            return {

                ...device,

                provider: new DummyProvider(device.name),

                latestData: null

            };

        });

        // Generate the first reading immediately
        this.devices.forEach(device => {

            device.latestData = device.provider.update();

        });

    }

    getDevices() {

        return this.devices.map(device => ({

            id: device.id,

            name: device.name,

            enabled: device.enabled,

            type: device.type,

            data: device.latestData

        }));

    }

    getDevice(id) {

        const device = this.devices.find(d => d.id == id);

        if (!device) {

            return null;

        }

        return {

            id: device.id,

            name: device.name,

            enabled: device.enabled,

            type: device.type,

            data: device.latestData

        };

    }

}

module.exports = new DeviceManager();