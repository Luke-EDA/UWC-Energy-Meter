/**
 * Dummy data provider for the UWC Energy Monitor.
 * Generates smooth, continuously changing values rather than
 * completely random readings.
 */

class DummyProvider {

    constructor(deviceName) {

        this.deviceName = deviceName;

        this.state = {

            voltage: {
                l1: this.random(229,232),
                l2: this.random(229,232),
                l3: this.random(229,232)
            },

            current: {
                l1: this.random(5,40),
                l2: this.random(5,40),
                l3: this.random(5,40)
            },

            frequency: this.random(49.95,50.05),

            powerFactor: this.random(0.92,0.99),

            energyToday: this.random(25,120),

            totalEnergy: this.random(1000,9000)
        };

    }

    random(min,max){

        return Number((Math.random()*(max-min)+min).toFixed(2));

    }

    drift(value,min,max,amount){

        value += (Math.random()-0.5)*amount;

        if(value<min) value=min;

        if(value>max) value=max;

        return Number(value.toFixed(2));

    }

    update(){

        this.state.voltage.l1=this.drift(this.state.voltage.l1,228,234,0.30);
        this.state.voltage.l2=this.drift(this.state.voltage.l2,228,234,0.30);
        this.state.voltage.l3=this.drift(this.state.voltage.l3,228,234,0.30);

        this.state.current.l1=this.drift(this.state.current.l1,0,120,2);
        this.state.current.l2=this.drift(this.state.current.l2,0,120,2);
        this.state.current.l3=this.drift(this.state.current.l3,0,120,2);

        this.state.frequency=this.drift(this.state.frequency,49.9,50.1,0.01);

        this.state.powerFactor=this.drift(this.state.powerFactor,0.85,1.00,0.01);

        const avgVoltage=
            (this.state.voltage.l1+
            this.state.voltage.l2+
            this.state.voltage.l3)/3;

        const totalCurrent=
            this.state.current.l1+
            this.state.current.l2+
            this.state.current.l3;

        const totalPower=
            avgVoltage*totalCurrent*this.state.powerFactor/1000;

        this.state.energyToday += totalPower/3600;

        this.state.totalEnergy += totalPower/3600;

        return {

            averageVoltage:Number(avgVoltage.toFixed(1)),

            totalCurrent:Number(totalCurrent.toFixed(1)),

            totalPower:Number(totalPower.toFixed(2)),

            frequency:this.state.frequency,

            powerFactor:this.state.powerFactor,

            energyToday:Number(this.state.energyToday.toFixed(2)),

            totalEnergy:Number(this.state.totalEnergy.toFixed(2)),

            voltage:this.state.voltage,

            current:this.state.current,

            timestamp:new Date().toISOString()

        };

    }

}

module.exports=DummyProvider;