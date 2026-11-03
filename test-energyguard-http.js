'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { read } = require('./src/services/energyguardHttp');
const id = 'AABBCCDDEEFF';
const server = http.createServer((req,res) => {
  res.setHeader('content-type','application/json');
  const endpoints = {
    '/api/v1/measurements': {schema:'energyguard.measurement.v1',device_id:id,sequence:8,voltage_v:{l1:231,l2:0,l3:0}},
    '/api/v1/instantaneous': {schema:'energyguard.instantaneous.stage_c3.v1',phases:{l1:{voltage_signal_valid:true,current_signal_valid:true,current_a:1.64,active_power_w:381,reactive_power_var:-5.8,apparent_power_va:381.2,power_factor:.999,frequency_hz:50},l2:{voltage_signal_valid:false,current_signal_valid:false},l3:{voltage_signal_valid:false,current_signal_valid:false}}},
    '/api/v1/energy': {schema:'energyguard.energy.stage_c4a.v1',persistence_ok:true,phases:{l1:{import_wh:28},l2:{import_wh:0},l3:{import_wh:0}}}
  };
  res.end(JSON.stringify(endpoints[req.url] || {}));
});
server.listen(0,'127.0.0.1',async()=>{
  try {
    const d = await read({connection:{host:'127.0.0.1'},providerOptions:{energyguardDeviceId:id,energyguardPort:server.address().port},phaseConfig:{l1:{enabled:true},l2:{enabled:true},l3:{enabled:true}}});
    assert.equal(d.totalPower,.381); assert.equal(d.voltage.l2,null); assert.equal(d.powerKw.l2,null);
    assert.equal(d.energyWh,28); assert.equal(d.source,'energyguard-http');
    console.log('PASS: HTTP provider reads measured W, handles invalid phases, exposes energy.');
  } catch(e) {console.error(e);process.exitCode=1;} finally {server.close();}
});
